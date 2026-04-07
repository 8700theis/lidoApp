// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, router } from "expo-router";
import { useSession } from "../../hooks/useSession";
import React from "react";
import { Pressable, View, Text, AppState } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { supabase } from "../../lib/supabase";
import { useFocusEffect } from "@react-navigation/native";

export default function TabLayout() {
  const { session, loading } = useSession();
  const [chatUnreadTotal, setChatUnreadTotal] = React.useState(0);
  const email = session?.user?.email?.toLowerCase() ?? null;
  const colorScheme = useColorScheme();


  const COLORS = {
    bg: "#0B0F14",
    accent: "#F5C542",
    textSoft: "#B7C0C8",
  };

  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isAdmin, setIsAdmin] = React.useState(false);

  const refreshChatUnreadTotal = React.useCallback(async () => {
    if (!email) {
      setChatUnreadTotal(0);
      return;
    }

    try {
      // 1) Hent hold hvor brugeren er kaptajn
      const [{ data: captainTeams, error: capErr }, { data: playerLinks, error: plErr }] =
        await Promise.all([
          supabase.from("teams").select("id").eq("captain_email", email),
          supabase.from("team_players").select("team_id").eq("email", email),
        ]);

      if (capErr || plErr) {
        console.log("refreshChatUnreadTotal team lookup error:", capErr || plErr);
        setChatUnreadTotal(0);
        return;
      }

      const playerTeamIds = (playerLinks ?? []).map((l: any) => l.team_id as string);
      const allTeamIds = Array.from(
        new Set<string>([
          ...(captainTeams ?? []).map((t: any) => t.id as string),
          ...playerTeamIds,
        ])
      );

      if (allTeamIds.length === 0) {
        setChatUnreadTotal(0);
        return;
      }

      let total = 0;

      for (const teamId of allTeamIds) {
        const { data: readRow } = await supabase
          .from("team_chat_reads")
          .select("last_read_at")
          .eq("team_id", teamId)
          .eq("user_email", email)
          .maybeSingle();

        const lastReadAt = readRow?.last_read_at ?? null;

        let query = supabase
          .from("team_messages")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .neq("sender_email", email); // egne beskeder tæller ikke

        if (lastReadAt) {
          query = query.gt("created_at", lastReadAt);
        }

        const { count, error } = await query;

        if (!error) {
          total += count ?? 0;
        }
      }

      setChatUnreadTotal(total);
    } catch (e) {
      console.log("refreshChatUnreadTotal unexpected error:", e);
      setChatUnreadTotal(0);
    }
  }, [email]);

  const refreshNotificationUnread = React.useCallback(async () => {
    if (!email) {
      setUnreadCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_email", email)
        .eq("is_read", false)
        .in("type", [
          "match_invite",
          "match_selected",
          "team_message",
          "match_update",
          "match_reminder",
        ]);

      if (error) {
        console.log("refreshNotificationUnread error:", error.message);
        setUnreadCount(0);
        return;
      }

      setUnreadCount(count ?? 0);
    } catch (e) {
      console.log("refreshNotificationUnread unexpected error:", e);
      setUnreadCount(0);
    }
  }, [email]);

React.useEffect(() => {
  const checkAdmin = async () => {
    if (!session?.user?.id) {
      setIsAdmin(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .single();

    if (error) {
      console.log("profiles is_admin error:", error.message);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(!!data?.is_admin);
  };

  checkAdmin();
}, [session?.user?.id]);

  React.useEffect(() => {
    refreshChatUnreadTotal();
  }, [refreshChatUnreadTotal]);

  React.useEffect(() => {
    refreshNotificationUnread();
  }, [refreshNotificationUnread]);

  useFocusEffect(
    React.useCallback(() => {
      refreshChatUnreadTotal();
    }, [refreshChatUnreadTotal])
  );

  useFocusEffect(
    React.useCallback(() => {
      refreshNotificationUnread();
    }, [refreshNotificationUnread])
  );

  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshChatUnreadTotal();
        refreshNotificationUnread();
      }
    });

    return () => sub.remove();
  }, [refreshChatUnreadTotal, refreshNotificationUnread]);

  React.useEffect(() => {
    if (!email) return;

    const messagesChannel = supabase
      .channel("chat-unread-messages")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_messages",
        },
        () => {
          refreshChatUnreadTotal();
        }
      )
      .subscribe();

    const readsChannel = supabase
      .channel("chat-unread-reads")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_chat_reads",
        },
        () => {
          refreshChatUnreadTotal();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(readsChannel);
    };
  }, [email, refreshChatUnreadTotal]);

  if (loading) return null;

  if (!loading && !session) {
    return <Redirect href="/login" />;
  }
  

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.bg,
        },
        headerTitleStyle: {
          color: COLORS.accent,
          fontWeight: "700",
        },
        headerTintColor: COLORS.accent,
        headerShadowVisible: false,

        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopWidth: 0,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textSoft,
        headerShown: true,
        tabBarButton: HapticTab,
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/(modals)/profile")}
            style={{ marginRight: 15, padding: 6 }}
          >
            <View>
              <Ionicons
                name="person-circle"
                size={28}
                color={COLORS.textSoft}
              />
              {unreadCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    right: -2,
                    top: -2,
                    minWidth: 16,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 999,
                    backgroundColor: COLORS.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#0B0F14",
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons size={size} name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Kampe",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
          tabBarBadge:
            chatUnreadTotal > 0
              ? chatUnreadTotal > 9
                ? "9+"
                : chatUnreadTotal
              : undefined,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin Oversigt",
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
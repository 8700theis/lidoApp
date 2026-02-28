// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, router } from "expo-router";
import { useSession } from "../../hooks/useSession";
import React from "react";
import { Pressable, View, Text } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { supabase } from "../../lib/supabase";
import { useFocusEffect } from "@react-navigation/native";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useSession();

  const COLORS = {
    bg: "#0B0F14",
    accent: "#F5C542",
    textSoft: "#B7C0C8",
  };

  const [unreadCount, setUnreadCount] = React.useState(0);

  const refreshUnread = React.useCallback(async () => {
    if (!session?.user?.email) {
      setUnreadCount(0);
      return;
    }

    const email = session.user.email.toLowerCase();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("is_read", false)
    .in("type", ["match_invite", "match_selected", "team_message"]);

    if (!error && typeof count === "number") {
      setUnreadCount(count);
    }
  }, [session?.user?.email]);

  // Når bruger/ email ændrer sig
  React.useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  // Hver gang tabs kommer i fokus (fx efter man lukker modaler)
  useFocusEffect(
    React.useCallback(() => {
      refreshUnread();
    }, [refreshUnread])
  );

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
                      color: Colors[colorScheme ?? "light"].background,
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
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
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
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin Oversigt",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";

import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";

const COLORS = {
  bg: "#0B0F14",
  card: "#141C28",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

type NotificationRow = {
  id: string;
  user_email: string;
  type: string;
  title: string;
  body: string;
  match_id: string | null;
  is_read: boolean;
  created_at: string; // ISO-string
};

export default function TabHome() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const email = session?.user?.email?.toLowerCase() ?? null;

  // Helper til datoformat (14.03.2026 · 11:00)
  const formatDateTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);

    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();

    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");

    return `${day}.${month}.${year} · ${hours}:${minutes}`;
  };

  // Hent notifikationer til den aktuelle bruger
  const loadNotifications = async () => {
    if (!email) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, user_email, type, title, body, match_id, is_read, created_at"
      )
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("loadNotifications error:", error.message);
      setNotifications([]);
      setLoading(false);
      return;
    }

    setNotifications((data ?? []) as NotificationRow[]);
    setLoading(false);
  };

  // Første load når email er klar
  useEffect(() => {
    if (email) {
      loadNotifications();
    }
  }, [email]);

  // Reload når man går tilbage til Home-tabben
  useFocusEffect(
    useCallback(() => {
      if (email) {
        loadNotifications();
      }
    }, [email])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  // Når man trykker på en notifikation
  const handlePressNotification = async (notif: NotificationRow) => {
    // Markér som læst i DB (hvis den ikke allerede er det)
    if (!notif.is_read) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notif.id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notif.id ? { ...n, is_read: true } : n
          )
        );
      }
    }

    // Hvis den peger på en kamp → gå til kampens detail-view
    if (notif.match_id) {
      router.push(`/match/${notif.match_id}`);
    }
  };

  const handleMarkAllRead = async () => {
    if (!email || notifications.length === 0) return;

    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.inner} edges={["top", "left", "right"]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Hej{email ? "" : " der"} 👋</Text>
            <Text style={styles.subtitle}>
              {email
                ? "Her er dine seneste notifikationer."
                : "Du skal være logget ind for at se notifikationer."}
            </Text>
          </View>

          {notifications.some((n) => !n.is_read) && (
            <Pressable onPress={handleMarkAllRead} style={styles.markAll}>
              <Text style={styles.markAllText}>Markér alle som læst</Text>
            </Pressable>
          )}
        </View>

        {/* Liste */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.accent}
            />
          }
        >
          {loading ? (
            <View style={{ marginTop: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
            </View>
          ) : notifications.length === 0 ? (
            <View style={{ marginTop: 32, alignItems: "center" }}>
              <Text style={styles.emptyText}>
                Ingen notifikationer endnu.{"\n"}
                Du får besked her, når der bliver sat hold eller frigivet kampe.
              </Text>
            </View>
          ) : (
            notifications.map((n) => {
              const isUnread = !n.is_read;
              return (
                <Pressable
                  key={n.id}
                  onPress={() => handlePressNotification(n)}
                  style={[
                    styles.card,
                    isUnread && styles.cardUnread,
                  ]}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text
                      style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    <Text style={styles.cardDate}>
                      {formatDateTime(n.created_at)}
                    </Text>
                  </View>

                  <Text
                    style={styles.cardBody}
                    numberOfLines={3}
                  >
                    {n.body}
                  </Text>

                  {n.match_id && (
                    <Text style={styles.cardLinkHint}>
                      Tryk for at åbne kampen
                    </Text>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    color: COLORS.textSoft,
    fontSize: 13,
  },
  markAll: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignSelf: "flex-start",
  },
  markAllText: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: "600",
  },
  emptyText: {
    color: COLORS.textSoft,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardUnread: {
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.65)",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  cardTitleUnread: {
    fontWeight: "800",
  },
  cardDate: {
    color: COLORS.textSoft,
    fontSize: 11,
  },
  cardBody: {
    color: COLORS.text,
    fontSize: 13,
    marginTop: 4,
  },
  cardLinkHint: {
    marginTop: 6,
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "600",
  },
});
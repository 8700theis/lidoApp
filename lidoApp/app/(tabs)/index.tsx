import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
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

type TeamLite = {
  id: string;
  name: string;
};

export default function TabHome() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  // 🔹 NYT: hold-beskeder
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

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

    // 🔹 Hent alle hold brugeren er tilknyttet (kaptajn eller spiller)
  useEffect(() => {
    if (!email) {
      setTeams([]);
      return;
    }

    const loadTeams = async () => {
      try {
        // 1) find hold hvor brugeren er kaptajn, og hvor brugeren er spiller
        const [{ data: captainTeams, error: capErr }, { data: playerLinks, error: plErr }] =
          await Promise.all([
            supabase.from("teams").select("id,name").eq("captain_email", email),
            supabase.from("team_players").select("team_id").eq("email", email),
          ]);

        if (capErr || plErr) {
          console.log("loadTeams error:", capErr || plErr);
          setTeams([]);
          return;
        }

        const playerTeamIds = (playerLinks ?? []).map(
          (l: any) => l.team_id as string
        );

        const allTeamIds = Array.from(
          new Set<string>([
            ...(captainTeams ?? []).map((t: any) => t.id as string),
            ...playerTeamIds,
          ])
        );

        if (allTeamIds.length === 0) {
          setTeams([]);
          return;
        }

        // 2) hent hold-navne
        const { data: teamRows, error: teamErr } = await supabase
          .from("teams")
          .select("id,name")
          .in("id", allTeamIds);

        if (teamErr) {
          console.log("loadTeams teamErr:", teamErr.message);
          setTeams([]);
          return;
        }

        const uniqTeams: TeamLite[] = Array.from(
          new Map(
            (teamRows ?? []).map((t: any) => [
              t.id as string,
              { id: t.id as string, name: t.name as string },
            ])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name, "da"));

        setTeams(uniqTeams);
      } catch (err) {
        console.log("loadTeams unknown error:", err);
        setTeams([]);
      }
    };

    loadTeams();
  }, [email]);

    // 🔹 Vælg automatisk første hold, hvis ingen valgt
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

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

    // 🔹 Send besked til et hold → én notification pr. spiller
  const handleSendMessage = async () => {
    if (!email) {
      Alert.alert("Fejl", "Du skal være logget ind for at sende beskeder.");
      return;
    }

    if (!selectedTeamId) {
      Alert.alert("Vælg hold", "Vælg det hold, du vil sende beskeden til.");
      return;
    }

    const trimmed = messageText.trim();
    if (!trimmed) {
      Alert.alert("Tom besked", "Skriv en besked før du sender.");
      return;
    }

    try {
      setSending(true);

      // 1) Find holdnavn + kaptajn
      const [{ data: teamRow, error: teamErr }, { data: links, error: linksErr }] =
        await Promise.all([
          supabase
            .from("teams")
            .select("name,captain_email")
            .eq("id", selectedTeamId)
            .single(),
          supabase
            .from("team_players")
            .select("email")
            .eq("team_id", selectedTeamId),
        ]);

      if (teamErr || linksErr) {
        console.log("handleSendMessage recipients error", teamErr || linksErr);
        Alert.alert(
          "Fejl",
          "Kunne ikke finde spillere for det valgte hold. Prøv igen."
        );
        return;
      }

      const captainEmail = (teamRow?.captain_email || "").toLowerCase();
      const playerEmails = (links ?? []).map((l: any) =>
        (l.email || "").toLowerCase()
      );

      // 2) Saml unikke modtagere, undtagen afsenderen selv
      const allRecipientEmails = Array.from(
        new Set(
          [...playerEmails, captainEmail].filter(
            (addr) => addr && addr !== email
          )
        )
      );

      if (allRecipientEmails.length === 0) {
        Alert.alert(
          "Ingen modtagere",
          "Der er ingen andre spillere tilknyttet dette hold endnu."
        );
        return;
      }

      const title = `Besked til ${teamRow?.name ?? "dit hold"}`;
      const rows = allRecipientEmails.map((recipient) => ({
        user_email: recipient,
        type: "team_message",
        title,
        body: trimmed,
        match_id: null,
        is_read: false,
      }));

      const { error: insertErr } = await supabase
        .from("notifications")
        .insert(rows);

      if (insertErr) {
        console.log("handleSendMessage insert error", insertErr.message);
        Alert.alert("Fejl", "Kunne ikke sende beskeden. Prøv igen.");
        return;
      }

      setMessageText("");
      Alert.alert("Sendt", `Beskeden er sendt til ${teamRow?.name}.`);
    } catch (err) {
      console.log("handleSendMessage unknown error:", err);
      Alert.alert("Fejl", "Der skete en uventet fejl.");
    } finally {
      setSending(false);
    }
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

        {/* 🔹 NYT: Hold-beskeder */}
        {teams.length > 0 ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageTitle}>Hold-besked</Text>
            <Text style={styles.messageSubtitle}>
              Vælg et af dine hold og send en kort besked.
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.teamsScroll}
            >
              {teams.map((team) => {
                const isSelected = team.id === selectedTeamId;
                return (
                  <Pressable
                    key={team.id}
                    onPress={() => setSelectedTeamId(team.id)}
                    style={[
                      styles.teamChip,
                      isSelected && styles.teamChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.teamChipText,
                        isSelected && styles.teamChipTextSelected,
                      ]}
                    >
                      {team.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.messageInputRow}>
              <TextInput
                style={styles.messageInput}
                placeholder="Skriv din besked..."
                placeholderTextColor={COLORS.textSoft}
                value={messageText}
                onChangeText={setMessageText}
                multiline
                numberOfLines={2}
              />
            </View>

            <Pressable
              onPress={handleSendMessage}
              style={[
                styles.sendButton,
                (sending || !messageText.trim()) && { opacity: 0.6 },
              ]}
              disabled={sending || !messageText.trim()}
            >
              <Text style={styles.sendButtonText}>
                {sending ? "Sender..." : "Send besked"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <Text style={styles.noTeamsText}>
              Du er ikke tilknyttet nogen hold endnu, så du kan ikke sende
              hold-beskeder.
            </Text>
          </View>
        )}

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
    // 🔹 Hold-beskeder
  messageBox: {
    marginTop: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  messageTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  messageSubtitle: {
    marginTop: 4,
    color: COLORS.textSoft,
    fontSize: 12,
  },
  teamsScroll: {
    marginTop: 10,
    marginBottom: 8,
  },
  teamChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    marginRight: 8,
  },
  teamChipSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  teamChipText: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "500",
  },
  teamChipTextSelected: {
    color: "#1A1205",
  },
  messageInputRow: {
    marginTop: 4,
  },
  messageInput: {
    minHeight: 40,
    maxHeight: 80,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: COLORS.text,
    fontSize: 13,
  },
  sendButton: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  sendButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1205",
  },
  noTeamsText: {
    color: COLORS.textSoft,
    fontSize: 12,
  },
});
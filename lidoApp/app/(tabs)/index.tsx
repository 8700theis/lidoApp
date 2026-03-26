import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../hooks/useSession";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#0B0F14",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

type UserTeam = {
  id: string;
  name: string;
};

type HomeMatch = {
  id: string;
  team_id: string;
  start_at: string;
  is_home: boolean;
  league: string | null;
  opponent: string;
  match_type: string | null;
  status: string;
  notes: string | null;
  signup_mode?: "availability" | "preselected" | "locked" | null;
  my_response?: "ready" | "not_ready" | null;
};

type HomeNotification = {
  id: string;
  type: string;
  match_id: string | null;
  is_read: boolean;
  created_at: string;
  needs_response?: boolean;
};

export default function TabHome() {
  const { session } = useSession();

  const email = session?.user?.email?.toLowerCase() ?? "";
  const [displayName, setDisplayName] = useState("");
  const [unreadChats, setUnreadChats] = useState(0);
  const [latestNotificationText, setLatestNotificationText] = useState("");
  const [notificationCount, setNotificationCount] = useState(0);
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [teams, setTeams] = useState<UserTeam[]>([]);
  const [matches, setMatches] = useState<HomeMatch[]>([]);
  const [pendingResponseCount, setPendingResponseCount] = useState(0);
  const [badges, setBadges] = useState({
    admin: false,
    captain: false,
    player: false,
  });

    const loadHomeData = useCallback(async () => {
      if (!email) {
        setTeams([]);
        setMatches([]);
        setPendingResponseCount(0);
        setIsAdmin(false);

        setUnreadChats(0);
        setLatestNotificationText("");
        setNotificationCount(0);
        setDisplayName("");
        setBadges({
          admin: false,
          captain: false,
          player: false,
        });
        setLoading(false);
        return;
      }

    setLoading(true);

    try {
      // admin-flag
      let adminFlag = false;

      if (userId) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("is_admin, name")
          .eq("id", userId)
          .single();

        adminFlag = !!profileRow?.is_admin;
        setIsAdmin(adminFlag);
        setDisplayName((profileRow?.name as string | undefined) ?? "");
      } else {
        setIsAdmin(false);
      }

      // hold brugeren er på
      const [{ data: captainTeams, error: capErr }, { data: playerLinks, error: plErr }] =
        await Promise.all([
          supabase.from("teams").select("id,name").eq("captain_email", email),
          supabase.from("team_players").select("team_id").eq("email", email),
        ]);

      if (capErr || plErr) {
        console.log("home team lookup error:", capErr || plErr);
        setTeams([]);
        setMatches([]);
        setPendingResponseCount(0);
        setLoading(false);
        return;
      }

      const playerTeamIds = (playerLinks ?? []).map((l: any) => l.team_id as string);
      const allTeamIds = Array.from(
        new Set<string>([
          ...(captainTeams ?? []).map((t: any) => t.id as string),
          ...playerTeamIds,
        ])
      );

      setBadges({
        admin: adminFlag,
        captain: (captainTeams ?? []).length > 0,
        player: allTeamIds.length > 0,
      });

      if (allTeamIds.length === 0) {
        setTeams(
          ((captainTeams ?? []) as any[]).map((t) => ({
            id: t.id as string,
            name: t.name as string,
          }))
        );
        setMatches([]);
        setUnreadChats(0);
        setBadges({
          admin: isAdmin,
          captain: (captainTeams ?? []).length > 0,
          player: false,
        });
      } else {
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
            .neq("sender_email", email);

          if (lastReadAt) {
            query = query.gt("created_at", lastReadAt);
          }

          const { count, error } = await query;

          if (!error) {
            total += count ?? 0;
          }
        }

        setUnreadChats(total);
      }

      if (allTeamIds.length === 0) {
        setTeams(
          ((captainTeams ?? []) as any[]).map((t) => ({
            id: t.id as string,
            name: t.name as string,
          }))
        );
        setMatches([]);
        setUnreadChats(0);
      } else {
        const { data: teamRows, error: teamErr } = await supabase
          .from("teams")
          .select("id,name")
          .in("id", allTeamIds);

        if (teamErr) {
          console.log("home teams error:", teamErr.message);
          setTeams([]);
        } else {
          const uniqTeams: UserTeam[] = Array.from(
            new Map(
              (teamRows ?? []).map((t) => [
                t.id as string,
                { id: t.id as string, name: t.name as string },
              ])
            ).values()
          ).sort((a, b) => a.name.localeCompare(b.name, "da"));

          setTeams(uniqTeams);
        }

        const { data: matchRows, error: matchErr } = await supabase
          .from("matches_with_effective_status")
          .select(
            "id,team_id,start_at,is_home,league,opponent,match_type,status,notes,signup_mode,effective_status"
          )
          .in("team_id", allTeamIds)
          .order("start_at", { ascending: true });

        if (matchErr) {
          console.log("home matches error:", matchErr.message);
          setMatches([]);
        } else {
          const now = new Date();

          const upcoming = ((matchRows ?? []) as any[])
            .filter((m) => {
              const effectiveStatus = m.effective_status ?? m.status;
              return (
                effectiveStatus === "planned" &&
                new Date(m.start_at).getTime() >= now.getTime()
              );
            })
            .map((m) => ({
              id: m.id as string,
              team_id: m.team_id as string,
              start_at: m.start_at as string,
              is_home: !!m.is_home,
              league: (m.league as string | null) ?? null,
              opponent: m.opponent as string,
              match_type: (m.match_type as string | null) ?? null,
              status: (m.effective_status as string) ?? (m.status as string),
              notes: (m.notes as string | null) ?? null,
              signup_mode: (m.signup_mode as "availability" | "preselected" | "locked" | null) ?? "availability",
            }));

          setMatches(upcoming);
        }
      }

      // afventer dig / klarmelding
      if (!userId) {
        setPendingResponseCount(0);
      } else {
        const { data, error } = await supabase
          .from("notifications")
          .select("id,type,match_id,is_read,created_at")
          .eq("user_email", email)
          .in("type", ["match_invite"])
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.log("home notifications error:", error.message);
          setPendingResponseCount(0);
          setLatestNotificationText("");
          setNotificationCount(0);
        } else {
          const rows = (data ?? []) as HomeNotification[];
          setNotificationCount(rows.filter((n) => !n.is_read).length);

          if (rows.length > 0) {
            const latest = rows[0];

            let label = "Ny notifikation";

            if (latest.type === "match_invite") {
              label = "Ny klarmelding eller kampinvitation";
            } else if (latest.type === "match_selected") {
              label = "Du er blevet sat på hold";
            } else if (latest.type === "match_cancelled") {
              label = "En kamp er blevet aflyst";
            }

            setLatestNotificationText(label);
          } else {
            setLatestNotificationText("");
          }

          const inviteMatchIds = rows
            .filter((n) => n.match_id)
            .map((n) => n.match_id as string);

          let responseMap: Record<string, "ready" | "not_ready" | null> = {};

          if (inviteMatchIds.length > 0) {
            const { data: respRows, error: respErr } = await supabase
              .from("match_responses")
              .select("match_id,status")
              .eq("user_id", userId)
              .in("match_id", inviteMatchIds);

            if (!respErr && respRows) {
              respRows.forEach((r: any) => {
                responseMap[r.match_id] =
                  r.status === "ready" || r.status === "not_ready"
                    ? (r.status as "ready" | "not_ready")
                    : null;
              });
            }
          }

          const needsResponseCount = rows.filter((n) => {
            if (!n.match_id) return false;
            return !responseMap[n.match_id];
          }).length;

          setPendingResponseCount(needsResponseCount);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [email, userId]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  const nextMatch = useMemo(() => {
    return matches.length > 0 ? matches[0] : null;
  }, [matches]);

  const getTeamName = (teamId: string) =>
    teams.find((t) => t.id === teamId)?.name ?? "Ukendt hold";

  const formatStart = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString("da-DK", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: "Europe/Copenhagen",
    });

    const time = d
      .toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Copenhagen",
      })
      .replace(/\./g, ":");

    return `${date} · ${time}`;
  };

  const signupModeLabel = (mode?: string | null) => {
    if (mode === "preselected") return "Hold sat";
    if (mode === "locked") return "Låst";
    return "Klarmelding";
  };

  const renderRoleBadges = () => {
    if (!badges.admin && !badges.captain && !badges.player) return null;

    return (
      <View style={styles.roleBadge}>
        {badges.admin && (
          <Ionicons
            name="shield-checkmark-outline"
            size={12}
            color={COLORS.accent}
            style={{ marginRight: 4 }}
          />
        )}
        {badges.captain && (
          <Ionicons
            name="flag-outline"
            size={12}
            color="#7FB2FF"
            style={{ marginRight: 4 }}
          />
        )}
        {badges.player && (
          <Ionicons
            name="navigate-outline"
            size={12}
            color="#3EE08E"
          />
        )}
      </View>
    );
  };

  function getMatchCountdown(startAt: string) {
    const now = new Date();
    const start = new Date(startAt);

    const diffMs = start.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Kampen starter snart";
    if (diffHours < 24) return `Kampen starter om ${diffHours} timer`;
    if (diffDays === 1) return "Kampen starter i morgen";
    return `Kampen starter om ${diffDays} dage`;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.inner} edges={["left", "right", "bottom"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.pageHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                Hej{displayName ? `, ${displayName}` : email ? `, ${email}` : ""} 👋
              </Text>
              {renderRoleBadges()}
            </View>

            <Text style={styles.subtitle}>Her er dit overblik i klubben.</Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={COLORS.textSoft} />
              <Text style={styles.helpText}>Henter dit overblik...</Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Næste kamp</Text>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.accent} />
                </View>


                {!nextMatch ? (
                  <Text style={styles.cardTextSoft}>Ingen kommende kampe endnu.</Text>
                ) : (
                  <>
                    <Text style={styles.cardMainText}>
                      {getTeamName(nextMatch.team_id)} · {nextMatch.is_home ? "hjemme" : "ude"}
                    </Text>
                    <Text style={styles.cardTextSoft}>
                      {getMatchCountdown(nextMatch.start_at)}
                    </Text>
                    <Text style={styles.cardText}>{formatStart(nextMatch.start_at)}</Text>
                    <Text style={styles.cardText}>Modstander: {nextMatch.opponent}</Text>

                    <View style={styles.badgeRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {signupModeLabel(nextMatch.signup_mode)}
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/match/[id]",
                          params: { id: nextMatch.id },
                        })
                      }
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Se kamp</Text>
                    </Pressable>
                  </>
                )}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Afventer dig</Text>
                  <Ionicons name="notifications-outline" size={18} color={COLORS.accent} />
                </View>

                {pendingResponseCount > 0 ? (
                  <>
                    <Text style={styles.cardMainText}>
                      Du mangler at svare på {pendingResponseCount}{" "}
                      {pendingResponseCount === 1 ? "kamp" : "kampe"}
                    </Text>
                    <Text style={styles.cardTextSoft}>
                      Gå til kampe og få styr på dine klarmeldinger.
                    </Text>

                    <Pressable
                      onPress={() => router.push("/(tabs)/matches")}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Gå til kampe</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardMainText}>Du er up to date ✅</Text>
                    <Text style={styles.cardTextSoft}>
                      Ingen klarmeldinger mangler dit svar lige nu.
                    </Text>
                  </>
                )}
              </View>
              
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Ulæste beskeder</Text>
                  <Ionicons name="chatbubble-outline" size={18} color={COLORS.accent} />
                </View>

                {unreadChats > 0 ? (
                  <>
                    <Text style={styles.cardMainText}>
                      Du har {unreadChats} ulæste {unreadChats === 1 ? "besked" : "beskeder"}
                    </Text>
                    <Text style={styles.cardTextSoft}>
                      Der er aktivitet i dit holds chat.
                    </Text>

                    <Pressable
                      onPress={() => router.push("/(tabs)/chat")}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Åbn chat</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardMainText}>Ingen nye beskeder</Text>
                    <Text style={styles.cardTextSoft}>
                      Du er helt up to date i chatten.
                    </Text>
                  </>
                )}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Notifikationer</Text>
                  <Ionicons name="notifications-outline" size={18} color={COLORS.accent} />
                </View>

                {notificationCount > 0 ? (
                  <>
                    <Text style={styles.cardMainText}>
                      {notificationCount} nye {notificationCount === 1 ? "notifikation" : "notifikationer"}
                    </Text>
                    <Text style={styles.cardTextSoft}>
                      {latestNotificationText || "Der er nyt til dig i klubben."}
                    </Text>

                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/(modals)/profile",
                          params: { initialMode: "notifications" },
                        })
                      }
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Åbn notifikationer</Text>
                    </Pressable>
                  </>
                ) : latestNotificationText ? (
                  <>
                    <Text style={styles.cardMainText}>{latestNotificationText}</Text>
                    <Text style={styles.cardTextSoft}>
                      Du har ingen ulæste notifikationer lige nu.
                    </Text>

                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/(modals)/profile",
                          params: { initialMode: "notifications" },
                        })
                      }
                      style={styles.secondaryCardButton}
                    >
                      <Text style={styles.secondaryCardButtonText}>Se alle notifikationer</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardMainText}>Ingen nye notifikationer</Text>
                    <Text style={styles.cardTextSoft}>
                      Der er ikke noget nyt til dig lige nu.
                    </Text>
                  </>
                )}
              </View>

            </>
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
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },
  pageHeader: {
    marginBottom: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.textSoft,
    fontSize: 14,
  },
  loadingBox: {
    marginTop: 24,
    alignItems: "center",
    gap: 8,
  },
  helpText: {
    color: COLORS.textSoft,
    fontSize: 14,
  },
  card: {
    backgroundColor: "#151A22",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  cardMainText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  cardText: {
    color: COLORS.text,
    fontSize: 14,
  },
  cardTextSoft: {
    color: COLORS.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.45)",
  },
  badgeText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: "800",
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  quickChipActive: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.45)",
  },
  quickChipText: {
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  quickChipTextActive: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },

  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryCardButton: {
    marginTop: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  secondaryCardButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  loadingText: {
    color: COLORS.textSoft,
    fontSize: 14,
    opacity: 0.6,
  },
});
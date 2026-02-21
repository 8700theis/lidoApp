// app/(tabs)/matches.tsx
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSession } from "../../hooks/useSession";
import { supabase } from "../../lib/supabase";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#0B0F14",
  panel: "#0F1620",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
  chipBg: "rgba(255,255,255,0.06)",
  chipBgActive: "rgba(245,197,66,0.18)",
};

type MatchRow = {
  id: string;
  team_id: string;
  start_at: string;
  is_home: boolean;
  league: string | null;
  opponent: string;
  match_type: string | null;
  status: string; // 'planned' | 'played' | 'cancelled' etc.
  notes: string | null;
};

type UserTeam = {
  id: string;
  name: string;
};

type TimeFilter = "upcoming" | "all";

export default function MatchesScreen() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teams, setTeams] = useState<UserTeam[]>([]);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [teamFilter, setTeamFilter] = useState<string | "all">("all");

  // ---------- DATA LOAD ----------

  useEffect(() => {
    const load = async () => {
      if (!session?.user?.email) {
        setMatches([]);
        setTeams([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const email = session.user.email.toLowerCase();

      // 1) Find alle hold brugeren er på (kaptajn eller spiller)
      const [{ data: captainTeams, error: capErr }, { data: playerLinks, error: plErr }] =
        await Promise.all([
          supabase
            .from("teams")
            .select("id,name")
            .eq("captain_email", email),
          supabase
            .from("team_players")
            .select("team_id")
            .eq("email", email),
        ]);

      if (capErr || plErr) {
        console.error(capErr || plErr);
        setLoading(false);
        return;
      }

      const playerTeamIds = (playerLinks ?? []).map((l) => l.team_id as string);
      const allTeamIds = Array.from(
        new Set<string>([
          ...(captainTeams ?? []).map((t) => t.id as string),
          ...playerTeamIds,
        ])
      );

      if (allTeamIds.length === 0) {
        setTeams([]);
        setMatches([]);
        setLoading(false);
        return;
      }

      // 2) Hent hold-navne (unik liste)
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name")
        .in("id", allTeamIds);

      if (teamErr) {
        console.error(teamErr);
        setLoading(false);
        return;
      }

      const uniqTeams: UserTeam[] = Array.from(
        new Map(
          (teamRows ?? []).map((t) => [t.id as string, { id: t.id as string, name: t.name as string }])
        ).values()
      ).sort((a, b) => a.name.localeCompare(b.name, "da"));

      setTeams(uniqTeams);

      // 3) Hent kampe for de hold
      const { data: matchRows, error: matchErr } = await supabase
        .from("matches")
        .select(
          "id,team_id,start_at,is_home,league,opponent,match_type,status,notes"
        )
        .in("team_id", allTeamIds)
        .order("start_at", { ascending: true });

      if (matchErr) {
        console.error(matchErr);
        setLoading(false);
        return;
      }

      setMatches((matchRows ?? []) as MatchRow[]);
      setLoading(false);
    };

    load();
  }, [session?.user?.email]);

  // ---------- FILTERED / GROUPED DATA ----------

  const filteredGroups = useMemo(() => {
    const now = new Date();

    let filtered = matches.slice();

    // Kommmende vs alle
    if (timeFilter === "upcoming") {
      filtered = filtered.filter((m) => new Date(m.start_at) >= now);
    }

    // Filter på hold
    if (teamFilter !== "all") {
      filtered = filtered.filter((m) => m.team_id === teamFilter);
    }

    // Sorter for en sikkerheds skyld
    filtered.sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    // Gruppér på dato (YYYY-MM-DD)
    const groups: {
      [dateKey: string]: {
        date: Date;
        items: MatchRow[];
      };
    } = {};

    for (const m of filtered) {
      const d = new Date(m.start_at);
      const key = d.toISOString().slice(0, 10); // yyyy-mm-dd

      if (!groups[key]) {
        groups[key] = { date: d, items: [] };
      }
      groups[key].items.push(m);
    }

    // Til array, sorteret efter dato
    return Object.values(groups).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [matches, timeFilter, teamFilter]);

  const formatDateHeader = (d: Date) => {
    // f.eks. "man. 10. mar."
    return new Intl.DateTimeFormat("da-DK", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(d);
  };

  const formatTime = (d: Date) =>
    new Intl.DateTimeFormat("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

  const getTeamName = (teamId: string) =>
    teams.find((t) => t.id === teamId)?.name ?? "Ukendt hold";

  const statusLabel = (status: string) => {
    const s = status.toLowerCase();
    if (s === "played") return "Spillet";
    if (s === "cancelled") return "Aflyst";
    return "Planlagt";
  };

  const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === "played") return "#3EE08E";
    if (s === "cancelled") return "#FF5252";
    return COLORS.textSoft;
  };

    const openMatch = (match: MatchRow) => {
        router.push({
        pathname: "../match/[id]",
        params: { id: match.id },
        });
    };

  // ---------- RENDER ----------

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top title */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Mine kampe</Text>
          <Text style={styles.pageSubtitle}>
            Overblik over de kampe du er sat på
          </Text>
        </View>

        {/* Filter: kommende / alle */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setTimeFilter("upcoming")}
            style={[
              styles.toggleChip,
              timeFilter === "upcoming" && styles.toggleChipActive,
            ]}
          >
            <Text
              style={[
                styles.toggleChipText,
                timeFilter === "upcoming" && styles.toggleChipTextActive,
              ]}
            >
              Kommende
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTimeFilter("all")}
            style={[
              styles.toggleChip,
              timeFilter === "all" && styles.toggleChipActive,
            ]}
          >
            <Text
              style={[
                styles.toggleChipText,
                timeFilter === "all" && styles.toggleChipTextActive,
              ]}
            >
              Alle
            </Text>
          </Pressable>
        </View>

        {/* Filter: hold */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.teamChipsRow}
        >
          <Pressable
            onPress={() => setTeamFilter("all")}
            style={[
              styles.teamChip,
              teamFilter === "all" && styles.teamChipActive,
            ]}
          >
            <Text
              style={[
                styles.teamChipText,
                teamFilter === "all" && styles.teamChipTextActive,
              ]}
            >
              Alle hold
            </Text>
          </Pressable>

          {teams.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTeamFilter(t.id)}
              style={[
                styles.teamChip,
                teamFilter === t.id && styles.teamChipActive,
              ]}
            >
              <Text
                style={[
                  styles.teamChipText,
                  teamFilter === t.id && styles.teamChipTextActive,
                ]}
              >
                {t.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={COLORS.textSoft} />
            <Text style={styles.helpText}>Henter kampe...</Text>
          </View>
        ) : filteredGroups.length === 0 ? (
          <Text style={styles.helpText}>
            Ingen kampe at vise endnu. Når klubben opretter kampe for dine
            hold, dukker de op her.
          </Text>
        ) : (
          filteredGroups.map((group) => (
            <View key={group.date.toISOString()} style={{ marginTop: 18 }}>
              <Text style={styles.dateHeader}>
                {formatDateHeader(group.date)}
              </Text>

              {group.items.map((m) => {
                const d = new Date(m.start_at);
                const timeStr = formatTime(d);
                const teamName = getTeamName(m.team_id);

                const title = `${teamName} vs ${m.opponent}`;
                const place = m.is_home ? "Hjemme" : "Ude";

                return (
                  <Pressable
                    key={m.id}
                    style={styles.matchCard}
                    onPress={() => openMatch(m)}
                    >
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View>
                        <Text style={styles.matchTime}>{timeStr}</Text>
                        <Text style={styles.matchTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={styles.matchSub}>{place}</Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        {m.match_type ? (
                          <View style={styles.typeBadge}>
                            <Text style={styles.typeBadgeText}>
                              {m.match_type}
                            </Text>
                          </View>
                        ) : null}

                        <Text
                          style={[
                            styles.statusLabel,
                            { color: statusColor(m.status) },
                          ]}
                        >
                          {statusLabel(m.status)}
                        </Text>
                      </View>
                    </View>

                    {m.league ? (
                      <View style={styles.leagueRow}>
                        <Ionicons
                          name="trophy-outline"
                          size={14}
                          color={COLORS.textSoft}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.leagueText} numberOfLines={1}>
                          {m.league}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  pageHeader: {
    marginBottom: 16,
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
  },
  pageSubtitle: {
    color: COLORS.textSoft,
    fontSize: 14,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  toggleChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.chipBg,
  },
  toggleChipActive: {
    backgroundColor: COLORS.chipBgActive,
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.45)",
  },
  toggleChipText: {
    color: COLORS.textSoft,
    fontSize: 14,
    fontWeight: "600",
  },
  toggleChipTextActive: {
    color: COLORS.text,
  },
  teamChipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  teamChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.chipBg,
  },
  teamChipActive: {
    backgroundColor: COLORS.chipBgActive,
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.45)",
  },
  teamChipText: {
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: "600",
  },
  teamChipTextActive: {
    color: COLORS.text,
  },
  loadingBox: {
    marginTop: 30,
    alignItems: "center",
    gap: 8,
  },
  helpText: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 6,
  },
  dateHeader: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginBottom: 8,
    textTransform: "capitalize",
  },
  matchCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  matchTime: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  matchTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  matchSub: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 6,
  },
  typeBadgeText: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: "600",
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  leagueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  leagueText: {
    color: COLORS.textSoft,
    fontSize: 12,
  },
});
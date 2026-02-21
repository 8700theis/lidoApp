import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  FlatList,
} from "react-native";

const COLORS = {
  bg: "#0B0F14",
  panel: "#0F1620",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

type MatchStatus = "planned" | "played" | "cancelled";

type Match = {
  id: string;
  teamId: string;
  teamName: string;
  opponent: string;
  startTime: string; // ISO
  location: string;
  type: "league" | "cup" | "friendly";
  status: MatchStatus;
};

type MyTeam = { id: string; name: string };

// 🔹 Dummy: mine hold
const MY_TEAMS: MyTeam[] = [
  { id: "lido1", name: "Lido 1" },
  { id: "lido2", name: "Lido 2" },
];

// 🔹 Dummy: kampe hvor jeg er udtaget
const DUMMY_MATCHES: Match[] = [
  {
    id: "m1",
    teamId: "lido1",
    teamName: "Lido 1",
    opponent: "Hvidovre",
    startTime: "2025-03-21T18:30:00Z",
    location: "Lido Hallen",
    type: "league",
    status: "planned",
  },
  {
    id: "m2",
    teamId: "lido1",
    teamName: "Lido 1",
    opponent: "Køge",
    startTime: "2025-03-10T18:30:00Z",
    location: "Ude",
    type: "friendly",
    status: "played",
  },
  {
    id: "m3",
    teamId: "lido2",
    teamName: "Lido 2",
    opponent: "Brøndby",
    startTime: "2025-03-25T20:00:00Z",
    location: "Lido Hallen",
    type: "league",
    status: "planned",
  },
];

type Mode = "upcoming" | "all";

export default function MatchesScreen() {
  const [mode, setMode] = useState<Mode>("upcoming");
  const [selectedTeamId, setSelectedTeamId] = useState<string | "all">("all");

  const now = new Date();

  const filteredMatches = useMemo(() => {
    return DUMMY_MATCHES.filter((m) => {
      if (mode === "upcoming") {
        const date = new Date(m.startTime);
        if (date < now) return false;
      }

      if (selectedTeamId !== "all" && m.teamId !== selectedTeamId) {
        return false;
      }

      return true;
    }).sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [mode, selectedTeamId, now]);

  const sections = useMemo(() => {
    const result: { dateLabel: string; items: Match[] }[] = [];

    for (const match of filteredMatches) {
      const d = new Date(match.startTime);
      const dateLabel = d.toLocaleDateString("da-DK", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      const existing = result.find((s) => s.dateLabel === dateLabel);
      if (existing) {
        existing.items.push(match);
      } else {
        result.push({ dateLabel, items: [match] });
      }
    }

    return result;
  }, [filteredMatches]);

  const renderMatchCard = (match: Match) => {
    const d = new Date(match.startTime);
    const timeLabel = d.toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const typeLabel =
      match.type === "league"
        ? "Turnering"
        : match.type === "cup"
        ? "Cup"
        : "Træningskamp";

    return (
      <View style={styles.matchCard}>
        <View style={styles.matchHeaderRow}>
          <Text style={styles.matchTime}>{timeLabel}</Text>
          <View style={styles.matchTypeBadge}>
            <Text style={styles.matchTypeText}>{typeLabel}</Text>
          </View>
        </View>

        <Text style={styles.matchTeams} numberOfLines={1}>
          {match.teamName} vs {match.opponent}
        </Text>

        <View style={styles.matchFooterRow}>
          <Text style={styles.matchLocation}>{match.location}</Text>

          {match.status === "played" && (
            <Text style={styles.matchStatusPlayed}>Spillet</Text>
          )}
          {match.status === "cancelled" && (
            <Text style={styles.matchStatusCancelled}>Aflyst</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mine kampe</Text>
          <Text style={styles.subtitle}>
            Overblik over de kampe du er sat på
          </Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setMode("upcoming")}
            style={[
              styles.toggleChip,
              mode === "upcoming" && styles.toggleChipActive,
            ]}
          >
            <Text
              style={[
                styles.toggleChipText,
                mode === "upcoming" && styles.toggleChipTextActive,
              ]}
            >
              Kommende
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMode("all")}
            style={[
              styles.toggleChip,
              mode === "all" && styles.toggleChipActive,
            ]}
          >
            <Text
              style={[
                styles.toggleChipText,
                mode === "all" && styles.toggleChipTextActive,
              ]}
            >
              Alle
            </Text>
          </Pressable>
        </View>

        {/* Team filter */}
        <View style={styles.teamFilterRow}>
          <Pressable
            onPress={() => setSelectedTeamId("all")}
            style={[
              styles.teamChip,
              selectedTeamId === "all" && styles.teamChipActive,
            ]}
          >
            <Text
              style={[
                styles.teamChipText,
                selectedTeamId === "all" && styles.teamChipTextActive,
              ]}
            >
              Alle hold
            </Text>
          </Pressable>

          {MY_TEAMS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setSelectedTeamId(t.id)}
              style={[
                styles.teamChip,
                selectedTeamId === t.id && styles.teamChipActive,
              ]}
            >
              <Text
                style={[
                  styles.teamChipText,
                  selectedTeamId === t.id && styles.teamChipTextActive,
                ]}
              >
                {t.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Liste */}
        {sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Ingen kampe at vise</Text>
            <Text style={styles.emptyText}>
              Skift filter eller spørg din træner, hvis du mangler kampe her.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sections}
            keyExtractor={(s) => s.dateLabel}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{item.dateLabel}</Text>
                <View style={{ gap: 10 }}>
                  {item.items.map((m) => (
                    <View key={m.id}>{renderMatchCard(m)}</View>
                  ))}
                </View>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  root: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    marginBottom: 16,
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
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  toggleChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  toggleChipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.35)",
  },
  toggleChipText: {
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: "600",
  },
  toggleChipTextActive: {
    color: COLORS.text,
  },
  teamFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  teamChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  teamChipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.35)",
  },
  teamChipText: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "600",
  },
  teamChipTextActive: {
    color: COLORS.text,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginBottom: 6,
  },
  matchCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  matchHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  matchTime: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  matchTypeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  matchTypeText: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: "600",
  },
  matchTeams: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  matchFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchLocation: {
    color: COLORS.textSoft,
    fontSize: 12,
  },
  matchStatusPlayed: {
    color: "#6DD58C",
    fontSize: 12,
    fontWeight: "600",
  },
  matchStatusCancelled: {
    color: "#FF6B6B",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: {
    color: COLORS.textSoft,
    fontSize: 13,
    textAlign: "center",
  },
});
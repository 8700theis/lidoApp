import { useSession } from "../../hooks/useSession";
import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#0B0F14",
  panel: "#0F1620",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

type MatchDetail = {
  id: string;
  team_id: string;
  start_at: string;
  is_home: boolean;
  league: string | null;
  opponent: string;
  match_type: string | null;
  status: string;
  notes: string | null;
  team: {
    id: string;
    name: string;
  } | null;
};

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

    const { session } = useSession();

    const [match, setMatch] = useState<MatchDetail | null>(null);
    const [loading, setLoading] = useState(true);

    // 👇 ny state til klarmelding
    const [availability, setAvailability] = useState<"ready" | "not_ready" | null>(null);
    const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      setLoading(true);

        const { data, error } = await supabase
        .from("matches")
        .select(
            "id, team_id, start_at, is_home, league, opponent, match_type, status, notes"
        )
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

        if (!data) {
        setLoading(false);
        return;
        }

        // slå holdet op ud fra team_id
        let team: { id: string; name: string } | null = null;

        if (data.team_id) {
        const { data: teamRow, error: teamErr } = await supabase
            .from("teams")
            .select("id, name")
            .eq("id", data.team_id)
            .single();

        if (!teamErr && teamRow) {
            team = { id: teamRow.id, name: teamRow.name };
        } else {
            console.log("Kunne ikke hente holdnavn:", teamErr?.message);
        }
        }

        // byg et MatchDetail-objekt
        const mapped: MatchDetail = {
        id: data.id,
        team_id: data.team_id,
        start_at: data.start_at,
        is_home: data.is_home,
        league: data.league,
        opponent: data.opponent,
        match_type: data.match_type,
        status: data.status,
        notes: data.notes,
        team,
        };

        setMatch(mapped);

        // 👇 hent spillerens eksisterende klarmelding, hvis logget ind
        if (session?.user?.id) {  
        const {
            data: availabilityRow,
            error: availabilityError,
        } = await supabase
            .from("match_responses")
            .select("status")
            .eq("match_id", id)
            .eq("user_id", session.user.id)
            .maybeSingle(); // giver null hvis ingen record

        console.log("availabilityRow", availabilityRow);
        console.log("availabilityError", availabilityError);

        if (!availabilityError && availabilityRow) {
            setAvailability(availabilityRow.status as "ready" | "not_ready");
        } else if (!availabilityError && !availabilityRow) {
            // ingen record endnu -> sørg for at knapperne er “neutrale”
            setAvailability(null);
        }
        }

        setLoading(false);
    };

    load();
  }, [id, session?.user?.id]);

  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat("da-DK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);

  const formatTime = (d: Date) =>
    new Intl.DateTimeFormat("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

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

    const handleAvailability = async (status: "ready" | "not_ready") => {
        if (!session?.user?.id || !id || savingAvailability) return;

        setSavingAvailability(true);

        const { error } = await supabase
            .from("match_responses")
            .upsert(
            {
                match_id: id,
                user_id: session.user.id,
                status,
            },
            { onConflict: "match_id,user_id" } // sørger for at opdatere hvis den findes
            );

        setSavingAvailability(false);

        if (error) {
            console.error(error);
            Alert.alert("Fejl", "Kunne ikke gemme din klarmelding.");
            return;
        }

        setAvailability(status);
    };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="small" color={COLORS.accent} />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.textSoft}>Kampen blev ikke fundet.</Text>
      </View>
    );
  }

  const d = new Date(match.start_at);
  const teamName = match.team?.name ?? "Ukendt hold";
  const place = match.is_home ? "Hjemme" : "Ude";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header med back-knap */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Ionicons name="chevron-back" size={20} color={COLORS.textSoft} />
          </Pressable>

          <Text style={styles.headerTitle}>Kampdetaljer</Text>

          {/* Tom spacer til symmetri */}
          <View style={styles.iconButton} />
        </View>

        {/* Kort med hovedinfo */}
        <View style={styles.mainCard}>
          <Text style={styles.teamName}>{teamName}</Text>
          <Text style={styles.opponent}>vs {match.opponent}</Text>

          <View style={{ marginTop: 12, gap: 4 }}>
            <Text style={styles.dateText}>{formatDate(d)}</Text>
            <Text style={styles.timeText}>{formatTime(d)}</Text>
            <Text style={styles.placeText}>{place}</Text>
          </View>

          <View style={styles.badgeRow}>
            {match.match_type ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{match.match_type}</Text>
              </View>
            ) : null}

            <View
              style={[
                styles.badge,
                { backgroundColor: "rgba(255,255,255,0.04)" },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: statusColor(match.status) },
                ]}
              >
                {statusLabel(match.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Din klarmelding */}
        <View style={styles.availabilityCard}>
            <Text style={styles.infoTitle}>Din klarmelding</Text>

            <View style={styles.availabilityRow}>
                {/* Klar */}
                <Pressable
                onPress={() => handleAvailability("ready")}
                disabled={savingAvailability}
                style={[
                    styles.availabilityButton,
                    availability === "ready" && styles.availabilityButtonActive,
                ]}
                >
                {savingAvailability && availability === "ready" ? (
                    <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                    <Text
                    style={[
                        styles.availabilityButtonText,
                        availability === "ready" && styles.availabilityButtonTextActive,
                    ]}
                    >
                    Klar
                    </Text>
                )}
                </Pressable>

                {/* Ikke klar */}
                <Pressable
                onPress={() => handleAvailability("not_ready")}
                disabled={savingAvailability}
                style={[
                    styles.availabilityButton,
                    availability === "not_ready" && styles.availabilityButtonActive,
                ]}
                >
                {savingAvailability && availability === "not_ready" ? (
                    <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                    <Text
                    style={[
                        styles.availabilityButtonText,
                        availability === "not_ready" && styles.availabilityButtonTextActive,
                    ]}
                    >
                    Ikke klar
                    </Text>
                )}
                </Pressable>
            </View>
        </View>

        {/* Liga */}
        {match.league ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <Ionicons
                name="trophy-outline"
                size={16}
                color={COLORS.textSoft}
              />
              <Text style={styles.infoTitle}>Liga</Text>
            </View>
            <Text style={styles.infoText}>{match.league}</Text>
          </View>
        ) : null}

        {/* Noter */}
        {match.notes ? (
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={COLORS.textSoft}
              />
              <Text style={styles.infoTitle}>Ekstra info</Text>
            </View>
            <Text style={styles.infoText}>{match.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  textSoft: {
    color: COLORS.textSoft,
    fontSize: 13,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  mainCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 16,
  },
  teamName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
  },
  opponent: {
    color: COLORS.text,
    fontSize: 16,
    marginTop: 4,
  },
  dateText: {
    color: COLORS.text,
    fontSize: 14,
    marginTop: 8,
  },
  timeText: {
    color: COLORS.textSoft,
    fontSize: 14,
  },
  placeText: {
    color: COLORS.textSoft,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  badgeText: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: "600",
  },
  infoCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  infoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 6,
  },
  infoTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  infoText: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 2,
  },
    responseCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    },

    responseTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
    },

    responseRow: {
    flexDirection: "row",
    gap: 10,
    },

    responseButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    },

    responseButtonActiveYes: {
    backgroundColor: "rgba(62,224,142,0.18)",
    borderWidth: 1,
    borderColor: "rgba(62,224,142,0.6)",
    },

    responseButtonActiveNo: {
    backgroundColor: "rgba(255,82,82,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,82,82,0.6)",
    },

    responseButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    },
    availabilityCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    },
    availabilityRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    },
    availabilityButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    },
    availabilityButtonActive: {
    backgroundColor: COLORS.accent,
    },
    availabilityButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    },
    availabilityButtonTextActive: {
    color: COLORS.bg,
    },
});
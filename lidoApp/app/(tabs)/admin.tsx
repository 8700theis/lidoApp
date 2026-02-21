import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#0B0F14",
  panel: "#0F1620",
  overlay: "rgba(0,0,0,0.32)",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

type AdminMatch = {
  id: string;
  team_id: string;
  team_name: string | null;
  start_at: string;     // ✅ matcher DB
  is_home: boolean;
  league: string | null;
  opponent: string;
  match_type: string | null;
  status: string;
  notes: string | null;
};

type TeamRow = { id: string; name: string };

export default function AdminMatchesScreen() {
  const { session } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<AdminMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editLeague, setEditLeague] = useState("");
  const [editOpponent, setEditOpponent] = useState("");
  const [editNote, setEditNote] = useState("");

    const [editIsHome, setEditIsHome] = useState(true);
    const [editType, setEditType] = useState("");
    const [editStatus, setEditStatus] = useState<"planned" | "played" | "cancelled">(
    "planned"
    );

  // 1) Tjek om user er admin (via profiles.is_admin)
  useEffect(() => {
    const loadAdminFlag = async () => {
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

    loadAdminFlag();
  }, [session?.user?.id]);

  // 2) Hent kampe + holdnavne
  const loadMatches = async () => {
    setLoading(true);

    const [{ data: matchData, error: matchErr }, { data: teamData, error: teamErr }] =
    await Promise.all([
        supabase
        .from("matches")
        .select("id, team_id, start_at, is_home, league, opponent, match_type, status, notes")
        .order("start_at", { ascending: true }),
        supabase.from("teams").select("id, name"),
    ]);

    if (matchErr) {
      setLoading(false);
      Alert.alert("Fejl", matchErr.message);
      return;
    }

    if (teamErr) {
      setLoading(false);
      Alert.alert("Fejl", teamErr.message);
      return;
    }

    const teamMap = new Map<string, string>();
    (teamData ?? []).forEach((t: TeamRow) => {
      teamMap.set(t.id, t.name);
    });

    const list: AdminMatch[] = (matchData ?? []).map((m: any) => ({
      ...m,
      team_name: teamMap.get(m.team_id) ?? "Ukendt hold",
    }));

    setMatches(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      loadMatches();
    }
  }, [isAdmin]);

  // Når man vælger en kamp → sync edit-felterne
    useEffect(() => {
    if (!selected) return;

    setEditLeague(selected.league ?? "");
    setEditOpponent(selected.opponent ?? "");
    setEditNote(selected.notes ?? "");

    // ⭐ nye felter
    setEditIsHome(selected.is_home);
    setEditType(selected.match_type ?? "");
    // fallback hvis status er tom / noget andet
    const s = (selected.status || "planned") as "planned" | "played" | "cancelled";
    setEditStatus(s);
    }, [selected]);

    const formatStart = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);

    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();

    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");

    return `${day}.${month}.${year} · ${hours}:${minutes}`;
    };

    const saveChanges = async () => {
    if (!selected) return;

    const opponent = editOpponent.trim();
    if (!opponent) {
        Alert.alert("Mangler", "Modstander må ikke være tom.");
        return;
    }

    const league = editLeague.trim() || null;
    const notes = editNote.trim() || null;
    const match_type = editType.trim() || null;
    const status = editStatus; // already en af de tre

    setSaving(true);
    const { error } = await supabase
        .from("matches")
        .update({
        league,
        opponent,
        notes,
        match_type,
        status,
        is_home: editIsHome,
        })
        .eq("id", selected.id);

    setSaving(false);

    if (error) {
        Alert.alert("Fejl", error.message);
        return;
    }

    // Opdatér lokalt
    setMatches((prev) =>
        prev.map((m) =>
        m.id === selected.id
            ? {
                ...m,
                league,
                opponent,
                notes,
                match_type,
                status,
                is_home: editIsHome,
            }
            : m
        )
    );

    Alert.alert("Gemt ✅", "Kampen er opdateret.");

    // ⭐ luk redigeringen efter gem
    setSelected(null);
    };

  const deleteMatch = async () => {
    if (!selected) return;

    Alert.alert(
      "Slet kamp?",
      "Er du sikker på, at du vil slette kampen? Det fjerner den overalt i appen.",
      [
        { text: "Annuller", style: "cancel" },
        {
          text: "Slet",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase
              .from("matches")
              .delete()
              .eq("id", selected.id);
            setDeleting(false);

            if (error) {
              Alert.alert("Fejl", error.message);
              return;
            }

            setMatches((prev) => prev.filter((m) => m.id !== selected.id));
            setSelected(null);
            Alert.alert("Slettet ✅", "Kampen er slettet.");
          },
        },
      ]
    );
  };

  // Ikke admin → vis lille besked
  if (isAdmin === false) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.textSoft}>
          Kun admins kan se og redigere kampe.
        </Text>
      </View>
    );
  }

  if (isAdmin === null) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="small" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.screenTitle}>Kampe (admin)</Text>

        {loading ? (
          <View style={{ marginTop: 16 }}>
            <ActivityIndicator size="small" color={COLORS.accent} />
          </View>
        ) : matches.length === 0 ? (
          <Text style={styles.textSoft}>Ingen kampe oprettet endnu.</Text>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
          >
            {matches.map((m) => {
              const isSelected = selected?.id === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelected(m)}
                  style={[
                    styles.matchRow,
                    isSelected && styles.matchRowActive,
                  ]}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchTeam} numberOfLines={1}>
                        {m.team_name}
                      </Text>
                      <Text style={styles.matchSubtitle} numberOfLines={1}>
                        {formatStart(m.start_at)}
                      </Text>
                      <Text style={styles.matchOpponent} numberOfLines={1}>
                        vs {m.opponent}
                      </Text>
                      {m.league ? (
                        <Text style={styles.matchLeague} numberOfLines={1}>
                          {m.league}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
                      <View
                        style={[
                          styles.homeAwayPill,
                          m.is_home ? styles.homePill : styles.awayPill,
                        ]}
                      >
                        <Text style={styles.homeAwayText}>
                          {m.is_home ? "Hjemme" : "Ude"}
                        </Text>
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={COLORS.textSoft}
                        style={{ marginTop: 12, opacity: 0.6 }}
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Edit-panel i bunden, hvis kamp valgt */}
        {selected && (
        <View style={styles.editPanel}>
            <Text style={styles.editTitle}>Rediger kamp</Text>

            {/* Lille meta-linje med hold + dato/tid */}
            <Text style={styles.editMeta}>
            {selected.team_name} · {formatStart(selected.start_at)}
            </Text>

            {/* Selve felterne gøres scrollbare */}
            <ScrollView
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            >
            {/* Liga */}
            <Text style={styles.editLabel}>Liga</Text>
            <TextInputLike
                value={editLeague}
                onChangeText={setEditLeague}
                placeholder="Fx Serie 3"
            />

            {/* Modstander */}
            <Text style={styles.editLabel}>Modstander</Text>
            <TextInputLike
                value={editOpponent}
                onChangeText={setEditOpponent}
                placeholder="Fx BK Frem"
            />

            {/* Bane (hjemme/ude) */}
            <Text style={styles.editLabel}>Bane</Text>
            <View style={styles.chipRow}>
                <Pressable
                onPress={() => setEditIsHome(true)}
                style={[
                    styles.chip,
                    editIsHome && styles.chipActive,
                ]}
                >
                <Text
                    style={[
                    styles.chipText,
                    editIsHome && styles.chipTextActive,
                    ]}
                >
                    Hjemme
                </Text>
                </Pressable>

                <Pressable
                onPress={() => setEditIsHome(false)}
                style={[
                    styles.chip,
                    !editIsHome && styles.chipActive,
                ]}
                >
                <Text
                    style={[
                    styles.chipText,
                    !editIsHome && styles.chipTextActive,
                    ]}
                >
                    Ude
                </Text>
                </Pressable>
            </View>

            {/* Type */}
            <Text style={styles.editLabel}>Type</Text>
            <TextInputLike
                value={editType}
                onChangeText={setEditType}
                placeholder="Fx Træningskamp, Turnering"
            />

            {/* Status */}
            <Text style={styles.editLabel}>Status</Text>
            <View style={styles.chipRow}>
                <Pressable
                onPress={() => setEditStatus("planned")}
                style={[
                    styles.chip,
                    editStatus === "planned" && styles.chipActive,
                ]}
                >
                <Text
                    style={[
                    styles.chipText,
                    editStatus === "planned" && styles.chipTextActive,
                    ]}
                >
                    Planlagt
                </Text>
                </Pressable>

                <Pressable
                onPress={() => setEditStatus("played")}
                style={[
                    styles.chip,
                    editStatus === "played" && styles.chipActive,
                ]}
                >
                <Text
                    style={[
                    styles.chipText,
                    editStatus === "played" && styles.chipTextActive,
                    ]}
                >
                    Spillet
                </Text>
                </Pressable>

                <Pressable
                onPress={() => setEditStatus("cancelled")}
                style={[
                    styles.chip,
                    editStatus === "cancelled" && styles.chipActive,
                ]}
                >
                <Text
                    style={[
                    styles.chipText,
                    editStatus === "cancelled" && styles.chipTextActive,
                    ]}
                >
                    Aflyst
                </Text>
                </Pressable>
            </View>

            {/* Note */}
            <Text style={styles.editLabel}>Note</Text>
            <TextInputLike
                value={editNote}
                onChangeText={setEditNote}
                placeholder="Ekstra info til kampen"
                multiline
            />
            </ScrollView>

            {/* Knapperne står fast under scrolleren */}
            <View style={{ marginTop: 12, gap: 8 }}>
            <Pressable
                onPress={saveChanges}
                disabled={saving || deleting}
                style={[
                styles.primaryButton,
                (saving || deleting) && { opacity: 0.7 },
                ]}
            >
                {saving ? (
                <ActivityIndicator size="small" color={COLORS.bg} />
                ) : (
                <Text style={styles.primaryButtonText}>Gem ændringer</Text>
                )}
            </Pressable>

            <Pressable
                onPress={deleteMatch}
                disabled={saving || deleting}
                style={[
                styles.dangerButton,
                (saving || deleting) && { opacity: 0.7 },
                ]}
            >
                {deleting ? (
                <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                <Text style={styles.dangerButtonText}>Slet kamp</Text>
                )}
            </Pressable>

            {/* ⭐ Luk uden at gemme */}
            <Pressable
                onPress={() => setSelected(null)}
                disabled={saving || deleting}
                style={styles.secondaryButton}
            >
                <Text style={styles.secondaryButtonText}>Luk uden at gemme</Text>
            </Pressable>
            </View>
        </View>
        )}
      </View>
    </View>
  );
}

/**
 * Lidt pseudo-TextInput så vi kan holde det i samme fil.
 * Hvis du hellere vil bruge rigtige TextInput, kan vi skifte.
 */
import { TextInput } from "react-native";

function TextInputLike(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={[
          styles.input,
          props.multiline && { height: 70, textAlignVertical: "top" },
        ]}
        multiline={props.multiline}
      />
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
    paddingTop: 18,
    paddingBottom: 16,
  },
  screenTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  textSoft: {
    color: COLORS.textSoft,
    fontSize: 13,
    textAlign: "center",
  },
  matchRow: {
    borderRadius: 16,
    backgroundColor: "#141C28",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  matchRowActive: {
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.60)",
  },
  matchTeam: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  matchSubtitle: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginTop: 2,
  },
  matchOpponent: {
    color: COLORS.text,
    fontSize: 13,
    marginTop: 4,
  },
  matchLeague: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginTop: 2,
  },
  homeAwayPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  homePill: {
    backgroundColor: "rgba(62,224,142,0.12)",
  },
  awayPill: {
    backgroundColor: "rgba(127,178,255,0.12)",
  },
  homeAwayText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "600",
  },
  editPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  editTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  editLabel: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginTop: 6,
  },
  inputWrap: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 4,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: "700",
  },
  dangerButton: {
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,82,82,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,82,82,0.40)",
  },
  dangerButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
    editMeta: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.40)",
  },
  chipText: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: COLORS.text,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
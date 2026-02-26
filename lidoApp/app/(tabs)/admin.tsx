import { useEffect, useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
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
  start_at: string;
  is_home: boolean;
  league: string | null;
  opponent: string;
  match_type: string | null;
  status: string;
  notes: string | null;
  signup_mode: "availability" | "preselected" | "locked";
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

  // signup / roster
  const [editSignupMode, setEditSignupMode] =
    useState<"availability" | "preselected" | "locked">("availability");

  // spillere tilknyttet holdet
  const [teamPlayers, setTeamPlayers] = useState<
    { email: string; name: string | null }[]
  >([]);
  const [teamPlayersLoading, setTeamPlayersLoading] = useState(false);

  // spillere der er valgt som udtagne (email lowercase)
  const [editSelectedRoster, setEditSelectedRoster] = useState<string[]>([]);

  // spillere der har meldt sig klar
  const [readyPlayers, setReadyPlayers] = useState<
    { email: string; name: string | null }[]
  >([]);

  // 1) tjek admin-flag
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

  // 2) hent kampe + holdnavne
  const loadMatches = async () => {
    setLoading(true);

    const [{ data: matchData, error: matchErr }, { data: teamData, error: teamErr }] =
      await Promise.all([
        supabase
          .from("matches")
          .select(
            "id, team_id, start_at, is_home, league, opponent, match_type, status, notes, signup_mode"
          )
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
      signup_mode: (m.signup_mode ||
        "availability") as "availability" | "preselected" | "locked",
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

  // når man kommer tilbage til tabben
  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        loadMatches();
      }
    }, [isAdmin])
  );

  // sync edit-felter når selected ændres
  // Når man vælger en kamp → sync edit-felter + hjælpe-data
  useEffect(() => {
    if (!selected) return;

    setEditLeague(selected.league ?? "");
    setEditOpponent(selected.opponent ?? "");
    setEditNote(selected.notes ?? "");

    setEditIsHome(selected.is_home);
    setEditType(selected.match_type ?? "");

    const s = (selected.status || "planned") as "planned" | "played" | "cancelled";
    setEditStatus(s);

    loadSelectedMatchDetails(selected);
  }, [selected]);

  const loadSelectedMatchDetails = async (match: AdminMatch) => {
    // 1) Hent spillere på holdet
    const { data: links, error: linksErr } = await supabase
      .from("team_players")
      .select("email")
      .eq("team_id", match.team_id);

    if (linksErr) {
      console.log("team_players error", linksErr.message);
      return;
    }

    const emails = (links ?? [])
      .map((l: any) => (l.email || "").toLowerCase())
      .filter(Boolean);

    let playersForTeam: Array<{ email: string; name: string | null }> = [];

    if (emails.length > 0) {
      const { data: allowed, error: allowedErr } = await supabase
        .from("allowed_users")
        .select("email,name")
        .in("email", emails);

      if (!allowedErr && allowed) {
        const map = new Map(
          allowed.map((u: any) => [
            (u.email || "").toLowerCase(),
            { email: (u.email || "").toLowerCase(), name: u.name },
          ])
        );

        playersForTeam = emails
          .map((e) => map.get(e))
          .filter(Boolean) as Array<{ email: string; name: string | null }>;
      }
    }

    setTeamPlayers(playersForTeam);

    // 2) Hent nuværende roster (udtagne spillere)
    const { data: rosterRows, error: rosterErr } = await supabase
      .from("match_roster")
      .select("email")
      .eq("match_id", match.id);

    let rosterEmails: string[] = [];
    if (!rosterErr && rosterRows) {
      rosterEmails = rosterRows
        .map((r: any) => (r.email || "").toLowerCase())
        .filter(Boolean);
    }

    // 3) Hent spillere der har meldt sig "klar"
    const { data: respRows, error: respErr } = await supabase
      .from("match_responses")
      .select("user_email")
      .eq("match_id", match.id)
      .eq("status", "ready");

    let readyEmails: string[] = [];
    if (!respErr && respRows) {
      // ⭐ FEJLEN HER: sørg for lowercase, så det matcher p.email
      readyEmails = respRows
        .map((r: any) => (r.user_email || "").toLowerCase())
        .filter(Boolean);
    }

    const readyList: Array<{ email: string; name: string | null }> =
      playersForTeam.filter((p) => readyEmails.includes(p.email));

    setReadyPlayers(readyList);

    // 4) UI-mode
    setEditSignupMode(match.signup_mode);

    // 5) Init hvilke emails der er valgt i UI, afhængigt af signup_mode
    if (match.signup_mode === "preselected") {
      // kamp hvor holdet allerede er sat → marker rosteren
      setEditSelectedRoster(rosterEmails);
    } else {
      // locked eller availability → start med tom selection,
      // admin vælger manuelt hvem der sættes på holdet
      setEditSelectedRoster([]);
    }
  };

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

  const signupModeLabel = (mode: string) => {
    if (mode === "preselected") return "Hold sat";
    if (mode === "locked") return "Låst";
    return "Klarmelding";
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
    const status = editStatus;

    // --- Beregn nyt signup_mode + roster ---
    let newSignupMode: "availability" | "preselected" | "locked" =
      selected.signup_mode;
    let newRosterEmails: string[] = [];

    if (selected.signup_mode === "locked") {
      if (editSignupMode === "availability") {
        newSignupMode = "availability";
        newRosterEmails = [];
      } else if (editSignupMode === "preselected") {
        newSignupMode = "preselected";
        newRosterEmails = editSelectedRoster;
      }
    } else if (selected.signup_mode === "availability") {
      // Hvis admin har valgt nogle klarmeldte → kamp går over til "Sæt hold"
      if (editSelectedRoster.length > 0) {
        newSignupMode = "preselected";
        newRosterEmails = editSelectedRoster;
      } else {
        newSignupMode = "availability";
        newRosterEmails = [];
      }
    } else if (selected.signup_mode === "preselected") {
      newSignupMode = "preselected";
      newRosterEmails = editSelectedRoster;
    }

    setSaving(true);

    try {
      // 1) Opdatér kampen
      const { error: matchErr } = await supabase
        .from("matches")
        .update({
          league,
          opponent,
          notes,
          match_type,
          status,
          is_home: editIsHome,
          signup_mode: newSignupMode,
        })
        .eq("id", selected.id);

      if (matchErr) throw matchErr;

      // 2) Opdatér match_roster
      const { error: delErr } = await supabase
        .from("match_roster")
        .delete()
        .eq("match_id", selected.id);

      if (delErr) throw delErr;

      if (newSignupMode === "preselected" && newRosterEmails.length > 0) {
        const rows = newRosterEmails.map((email) => ({
          match_id: selected.id,
          email,
        }));
        const { error: insErr } = await supabase
          .from("match_roster")
          .insert(rows);

        if (insErr) throw insErr;
      }

      // 3) Opdatér lokal state
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
                signup_mode: newSignupMode,
              }
            : m
        )
      );

      Alert.alert("Gemt ✅", "Kampen er opdateret.");
      setSelected(null);
    } catch (error: any) {
      console.error(error);
      Alert.alert("Fejl", error.message ?? "Kunne ikke gemme ændringer.");
    } finally {
      setSaving(false);
    }
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

  // ikke admin
  if (isAdmin === false) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.textSoft}>Kun admins kan se og redigere kampe.</Text>
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
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
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

                    <View
                      style={{
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                      }}
                    >
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

                      {/* signup-mode badge */}
                      <View style={styles.signupPill}>
                        <Text style={styles.signupPillText}>
                          {signupModeLabel(m.signup_mode)}
                        </Text>
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={COLORS.textSoft}
                        style={{ marginTop: 8, opacity: 0.6 }}
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

            {/* Hvis kampen er LÅST → vælg hvordan den skal frigives */}
            {selected.signup_mode === "locked" && (
              <>
                <Text style={styles.editLabel}>Frigiv som:</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setEditSignupMode("availability")}
                    style={[
                      styles.chip,
                      editSignupMode === "availability" && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        editSignupMode === "availability" && styles.chipTextActive,
                      ]}
                    >
                      Klarmelding
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setEditSignupMode("preselected")}
                    style={[
                      styles.chip,
                      editSignupMode === "preselected" && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        editSignupMode === "preselected" && styles.chipTextActive,
                      ]}
                    >
                      Sæt hold
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

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

              {/* --- Signup / roster logik --- */}

              {/* 1) availability → vis klarmeldte spillere */}
              {selected.signup_mode === "availability" && (
                <>
                  <Text style={styles.editLabel}>Klarmeldte spillere</Text>
                  {readyPlayers.length === 0 ? (
                    <Text style={styles.textSoft}>
                      Ingen spillere har meldt sig klar endnu.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4, gap: 6 }}>
                      {readyPlayers.map((p) => {
                        const email = p.email.toLowerCase();
                        const isSelected = editSelectedRoster.includes(email);

                        return (
                          <Pressable
                            key={email}
                            onPress={() =>
                              setEditSelectedRoster((prev) =>
                                prev.includes(email)
                                  ? prev.filter((e) => e !== email)
                                  : [...prev, email]
                              )
                            }
                            style={[
                              styles.rosterRow,
                              isSelected && styles.rosterRowActive,
                            ]}
                          >
                            <Text style={styles.rosterName}>
                              {p.name ?? p.email}
                            </Text>
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={COLORS.accent}
                              />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  <Text style={[styles.textSoft, { marginTop: 4 }]}>
                    Når du gemmer, bliver de valgte spillere sat som udtagne til kampen.
                  </Text>
                </>
              )}

              {/* 2) locked + valgt "Sæt hold" */}
              {selected.signup_mode === "locked" && editSignupMode === "preselected" && (
                <>
                  <Text style={styles.editLabel}>Udtagne spillere</Text>
                  {teamPlayers.length === 0 ? (
                    <Text style={styles.textSoft}>
                      Ingen spillere tilknyttet holdet endnu.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4, gap: 6 }}>
                      {teamPlayers.map((p) => {
                        const email = p.email.toLowerCase();
                        const isSelected = editSelectedRoster.includes(email);

                        return (
                          <Pressable
                            key={email}
                            onPress={() =>
                              setEditSelectedRoster((prev) =>
                                prev.includes(email)
                                  ? prev.filter((e) => e !== email)
                                  : [...prev, email]
                              )
                            }
                            style={[
                              styles.rosterRow,
                              isSelected && styles.rosterRowActive,
                            ]}
                          >
                            <Text style={styles.rosterName}>
                              {p.name ?? p.email}
                            </Text>
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={COLORS.accent}
                              />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {/* 3) preselected → redigér udtagne spillere */}
              {selected.signup_mode === "preselected" && (
                <>
                  <Text style={styles.editLabel}>Udtagne spillere</Text>
                  {teamPlayers.length === 0 ? (
                    <Text style={styles.textSoft}>
                      Ingen spillere tilknyttet holdet endnu.
                    </Text>
                  ) : (
                    <View style={{ marginTop: 4, gap: 6 }}>
                      {teamPlayers.map((p) => {
                        const email = p.email.toLowerCase();
                        const isSelected = editSelectedRoster.includes(email);

                        return (
                          <Pressable
                            key={email}
                            onPress={() =>
                              setEditSelectedRoster((prev) =>
                                prev.includes(email)
                                  ? prev.filter((e) => e !== email)
                                  : [...prev, email]
                              )
                            }
                            style={[
                              styles.rosterRow,
                              isSelected && styles.rosterRowActive,
                            ]}
                          >
                            <Text style={styles.rosterName}>
                              {p.name ?? p.email}
                            </Text>
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={COLORS.accent}
                              />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
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
  signupPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  signupPillText: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: "600",
  },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rosterRowActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.45)",
  },
  rosterName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
});
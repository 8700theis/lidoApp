import { useEffect, useState, useCallback, useRef } from "react";
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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import KeyboardDismissView from "@/components/KeyboardDismissView";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";
import { formatDateTime } from "../../utils/date";
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
  effective_status?: "planned" | "played" | "cancelled";
  notes: string | null;
  signup_mode: "availability" | "preselected" | "locked";
};

type TeamRow = { id: string; name: string };

export default function AdminMatchesScreen() {
  const { session } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [signupFilter, setSignupFilter] = useState<"upcoming" | "availability" | "preselected" | "locked" | "played" | "cancelled">("upcoming");
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
  const [readyPlayers, setReadyPlayers] = useState<{ email: string; name: string | null }[]>([]);

  const [pendingPlayers, setPendingPlayers] = useState<{ email: string; name: string | null }[]>([]);

  const editScrollRef = useRef<ScrollView | null>(null);

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
          .from("matches_with_effective_status")
          .select(
            "id, team_id, start_at, is_home, league, opponent, match_type, status, effective_status, notes, signup_mode"
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

    setEditLeague(selected.league ?? "Kvalrækken");
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

    const { data: allRespRows, error: allRespErr } = await supabase
      .from("match_responses")
      .select("user_email")
      .eq("match_id", match.id);

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

    let respondedEmails: string[] = [];
    if (!allRespErr && allRespRows) {
      respondedEmails = allRespRows
        .map((r: any) => (r.user_email || "").toLowerCase())
        .filter(Boolean);
    }

    const pendingList: Array<{ email: string; name: string | null }> =
      playersForTeam.filter((p) => !respondedEmails.includes(p.email));

    setPendingPlayers(pendingList);

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

  const filteredMatches = matches
    .filter((m) => {
      const effectiveStatus = m.effective_status ?? m.status;

      if (signupFilter === "played") return effectiveStatus === "played";
      if (signupFilter === "cancelled") return effectiveStatus === "cancelled";

      if (effectiveStatus !== "planned") return false;

      if (signupFilter === "upcoming") return true;
      if (signupFilter === "availability") return m.signup_mode === "availability";
      if (signupFilter === "preselected") return m.signup_mode === "preselected";
      if (signupFilter === "locked") return m.signup_mode === "locked";

      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.start_at).getTime();
      const bTime = new Date(b.start_at).getTime();

      if (signupFilter === "played" || signupFilter === "cancelled") {
        return bTime - aTime; // nyeste først
      }

      return aTime - bTime; // kommende: nærmest først
    });

  const signupModeLabel = (mode: string) => {
    if (mode === "preselected") return "Hold sat";
    if (mode === "locked") return "Låst";
    return "Klarmelding";
  };

  const requiredPlayersForMatchType = (type: string) => {
    if (type === "Hovedturnering") return 4;
    if (type === "Hverdagsturnering") return 3;
    return 0;
  };

  const buildMatchUpdateBody = (changes: string[]) => {
    if (changes.length === 0) return "";
    return changes.join(" • ");
  };

  const dedupeEmails = (emails: string[]) => {
    return Array.from(
      new Set(
        emails
          .map((e) => (e || "").toLowerCase().trim())
          .filter(Boolean)
      )
    );
  };

  const sendMatchNotifications = async (
    recipients: string[],
    type: "match_update" | "match_reminder",
    title: string,
    body: string,
    matchId: string
  ) => {
    const finalRecipients = dedupeEmails(recipients);

    if (finalRecipients.length === 0) return;

    const rows = finalRecipients.map((user_email) => ({
      user_email,
      type,
      title,
      body,
      match_id: matchId,
      is_read: false,
    }));

    const { error } = await supabase.from("notifications").insert(rows);

    if (error) {
      console.log("sendMatchNotifications error:", error.message);
    }
  };

  const scrollEditTo = (y: number) => {
    setTimeout(() => {
      editScrollRef.current?.scrollTo({
        y,
        animated: true,
      });
    }, 120);
  };

  const saveChanges = async () => {
    if (!selected) return;

    const opponent = editOpponent.trim();
    if (!opponent) {
      Alert.alert("Mangler", "Modstander må ikke være tom.");
      return;
    }

    const league = editLeague.trim();

    if (!league) {
      Alert.alert("Mangler", "Vælg en liga.");
      return;
    }
    const notes = editNote.trim() || null;
    const match_type = editType.trim();
    const status = editStatus;

    const previousStatus = selected.status;
    const previousOpponent = selected.opponent;
    const previousIsHome = selected.is_home;
    const previousNotes = selected.notes ?? null;
    const previousSignupMode = selected.signup_mode;

    const changeLines: string[] = [];

    // 1) aflyst
    if (previousStatus !== status && status === "cancelled") {
      changeLines.push("Kampen er blevet aflyst");
    }

    // 2) hjemme/ude ændret
    if (previousIsHome !== editIsHome) {
      changeLines.push(editIsHome ? "Kampen er nu hjemme" : "Kampen er nu ude");
    }

    // 3) modstander ændret
    if (previousOpponent !== opponent) {
      changeLines.push(`Modstander er ændret til ${opponent}`);
    }

    // 4) note ændret
    if ((previousNotes ?? "") !== (notes ?? "")) {
      changeLines.push("Noten til kampen er opdateret");
    }

    if (match_type !== "Hovedturnering" && match_type !== "Hverdagsturnering") {
      Alert.alert(
        "Mangler",
        'Vælg om kampen er "Hovedturnering" eller "Hverdagsturnering".'
      );
      return;
    }

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

    const holdIsNowSet =
      previousSignupMode !== "preselected" &&
      newSignupMode === "preselected" &&
      newRosterEmails.length > 0;

    if (holdIsNowSet) {
      changeLines.push("Holdet er sat");
    }

    if (newRosterEmails.length > 0) {
      const required = requiredPlayersForMatchType(match_type);

      if (required > 0 && newRosterEmails.length !== required) {
        Alert.alert(
          "Forkert antal spillere",
          `${match_type} kræver præcis ${required} spillere. Du har valgt ${newRosterEmails.length}.`
        );
        return;
      }
    }

    let updateRecipients: string[] = [];

    // Case 1: holdet bliver sat → kun de udtagne spillere
    if (holdIsNowSet) {
      updateRecipients = newRosterEmails;
    }
    // Case 2: kamp aflyses mens den stadig er klarmelding → kun klar + mangler svar
    else if (
      status === "cancelled" &&
      previousSignupMode === "availability"
    ) {
      updateRecipients = [
        ...readyPlayers.map((p) => p.email),
        ...pendingPlayers.map((p) => p.email),
      ];
    }
    // Case 3: kamp aflyses når holdet allerede er sat → kun roster
    else if (
      status === "cancelled" &&
      (previousSignupMode === "preselected" || newSignupMode === "preselected")
    ) {
      updateRecipients = newRosterEmails.length > 0 ? newRosterEmails : editSelectedRoster;
    }
    // Case 4: andre relevante ændringer → til dem der er relevante for kampen
    else if (changeLines.length > 0) {
      if (newSignupMode === "preselected" && newRosterEmails.length > 0) {
        updateRecipients = newRosterEmails;
      } else if (previousSignupMode === "availability") {
        updateRecipients = [
          ...readyPlayers.map((p) => p.email),
          ...pendingPlayers.map((p) => p.email),
        ];
      }
    }

    updateRecipients = dedupeEmails(updateRecipients);

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

      if (changeLines.length > 0 && updateRecipients.length > 0) {
        const title =
          status === "cancelled"
            ? `Kamp aflyst - ${selected.team_name}`
            : holdIsNowSet
            ? `Holdet er sat - ${selected.team_name}`
            : `Kamp opdateret - ${selected.team_name}`;

        const body = buildMatchUpdateBody(changeLines);

        await sendMatchNotifications(
          updateRecipients,
          "match_update",
          title,
          body,
          selected.id
        );
      }

      Alert.alert("Gemt ✅", "Kampen er opdateret.");
      setSelected(null);
    } catch (error: any) {
      console.error(error);
      Alert.alert("Fejl", error.message ?? "Kunne ikke gemme ændringer.");
    } finally {
      setSaving(false);
    }
  };

  const sendReminderToPendingPlayers = async () => {
    if (!selected) return;
    if (pendingPlayers.length === 0) {
      Alert.alert("Ingen mangler svar", "Alle spillere har allerede svaret.");
      return;
    }

    const recipients = pendingPlayers.map((p) => p.email);

    const title = `Mangler svar - ${selected.team_name}`;
    const body = `Vi mangler svar på klarmelding til kampen ${selected.team_name} vs ${selected.opponent} den ${formatStart(selected.start_at)}. Giv venligst svar hurtigst muligt.`;

    await sendMatchNotifications(
      recipients,
      "match_reminder",
      title,
      body,
      selected.id
    );

    Alert.alert("Sendt ✅", "Påmindelse sendt til spillere der mangler svar.");
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
      <View style={{ flex: 1 }}>
        <View style={styles.inner}>
          {!selected && (
            <>
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => setSignupFilter("upcoming")}
                  style={[
                    styles.toggleChip,
                    signupFilter === "upcoming" && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      signupFilter === "upcoming" && styles.toggleChipTextActive,
                    ]}
                  >
                    Alle kommende
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSignupFilter("availability")}
                  style={[
                    styles.toggleChip,
                    signupFilter === "availability" && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      signupFilter === "availability" && styles.toggleChipTextActive,
                    ]}
                  >
                    Klarmelding
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSignupFilter("preselected")}
                  style={[
                    styles.toggleChip,
                    signupFilter === "preselected" && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      signupFilter === "preselected" && styles.toggleChipTextActive,
                    ]}
                  >
                    Hold sat
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSignupFilter("locked")}
                  style={[
                    styles.toggleChip,
                    signupFilter === "locked" && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      signupFilter === "locked" && styles.toggleChipTextActive,
                    ]}
                  >
                    Låst
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSignupFilter("played")}
                  style={[
                    styles.toggleChip,
                    signupFilter === "played" && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      signupFilter === "played" && styles.toggleChipTextActive,
                    ]}
                  >
                    Spillet
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setSignupFilter("cancelled")}
                  style={[
                    styles.toggleChip,
                    signupFilter === "cancelled" && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      signupFilter === "cancelled" && styles.toggleChipTextActive,
                    ]}
                  >
                    Aflyst
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.screenTitle}>Kampe</Text>
            </>
          )}

          {loading ? (
            <View style={{ marginTop: 16 }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
            </View>
          ) : filteredMatches.length === 0 ? (
            <Text style={styles.textSoft}>
              {signupFilter === "upcoming"
                ? "Ingen kommende kampe endnu."
                : signupFilter === "played"
                ? "Ingen spillede kampe endnu."
                : signupFilter === "cancelled"
                ? "Ingen aflyste kampe endnu."
                : "Ingen kampe matcher det valgte filter."}
            </Text>
          ) : !selected ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 6, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredMatches.map((m) => {
                const isSelected = false;
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
                          {formatDateTime(m.start_at)}
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
          ) : (
            <Pressable
              onPress={() => {
                if (!saving && !deleting) {
                  setSelected(null);
                }
              }}
              style={[styles.matchRow, styles.matchRowActive, { marginBottom: 12 }]}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTeam} numberOfLines={1}>
                    {selected.team_name}
                  </Text>
                  <Text style={styles.matchSubtitle} numberOfLines={1}>
                    {formatDateTime(selected.start_at)}
                  </Text>
                  <Text style={styles.matchOpponent} numberOfLines={1}>
                    vs {selected.opponent}
                  </Text>
                  {selected.league ? (
                    <Text style={styles.matchLeague} numberOfLines={1}>
                      {selected.league}
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
                      selected.is_home ? styles.homePill : styles.awayPill,
                    ]}
                  >
                    <Text style={styles.homeAwayText}>
                      {selected.is_home ? "Hjemme" : "Ude"}
                    </Text>
                  </View>

                  <View style={styles.signupPill}>
                    <Text style={styles.signupPillText}>
                      {signupModeLabel(selected.signup_mode)}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-up"
                    size={16}
                    color={COLORS.textSoft}
                    style={{ marginTop: 8, opacity: 0.6 }}
                  />
                </View>
              </View>
            </Pressable>
          )}

          {/* Edit-panel i bunden, hvis kamp valgt */}
          {selected && (
            <View style={{ flex: 1 }}>
              <View style={styles.editPanel}>
                <Text style={styles.editTitle}>Rediger kamp</Text>

                {/* Lille meta-linje med hold + dato/tid */}
                <Text style={styles.editMeta}>
                  {selected.team_name} - {formatDateTime(selected.start_at)}
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
                <View style={{ flex: 1 }}>
                  <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={0}
                  >
                    <ScrollView
                      ref={editScrollRef}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ gap: 6, paddingBottom: 160 }}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                    >
                      {/* Modstander */}
                      <Text style={styles.editLabel}>Modstander</Text>
                      <TextInputLike
                        value={editOpponent}
                        onChangeText={setEditOpponent}
                        onFocus={() => scrollEditTo(60)}
                        placeholder="Fx BK Frem"
                      />

                      {/* Type */}
                      <View style={styles.inputWrap}>
                        <Text style={styles.inputLabel}>Type</Text>

                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Pressable
                            onPress={() => setEditType("Hovedturnering")}
                            style={[
                              styles.modeChip,
                              editType === "Hovedturnering" && styles.modeChipActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.modeChipText,
                                editType === "Hovedturnering" && styles.modeChipTextActive,
                              ]}
                            >
                              Hovedturnering
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() => setEditType("Hverdagsturnering")}
                            style={[
                              styles.modeChip,
                              editType === "Hverdagsturnering" && styles.modeChipActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.modeChipText,
                                editType === "Hverdagsturnering" && styles.modeChipTextActive,
                              ]}
                            >
                              Hverdagsturnering
                            </Text>
                          </Pressable>
                        </View>

                        <Text style={styles.helpText}>
                          Hovedturnering kræver 4 spillere. Hverdagsturnering kræver 3 spillere.
                        </Text>
                      </View>

                      {/* Liga */}
                      <View style={styles.inputWrap}>
                        <Text style={styles.inputLabel}>Liga</Text>

                        <View style={styles.chipWrap}>
                          {[
                            "Serie 1",
                            "Kvalrækken",
                            "Danmarksserien",
                            "3. Division",
                            "2. Division",
                            "1. Division",
                            "Eliterækken",
                          ].map((league) => (
                            <Pressable
                              key={league}
                              onPress={() => setEditLeague(league)}
                              style={[
                                styles.modeChip,
                                editLeague === league && styles.modeChipActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.modeChipText,
                                  editLeague === league && styles.modeChipTextActive,
                                ]}
                              >
                                {league}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

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

                      {/* Note */}
                      <Text style={styles.editLabel}>Note</Text>
                      <TextInputLike
                        value={editNote}
                        onChangeText={setEditNote}
                        onFocus={() => scrollEditTo(160)}
                        placeholder="Ekstra info til kampen"
                        multiline
                      />

                      {/* --- Signup / roster logik --- */}

                      {/* 1) availability → vis klarmeldte spillere */}
                      {selected.signup_mode === "availability" && (
                        <>
                          <Text style={styles.editLabel}>Klarmeldte spillere ({readyPlayers.length})</Text>
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

                          <Text style={[styles.editLabel, { marginTop: 12 }]}>Mangler svar ({pendingPlayers.length})</Text>

                          {pendingPlayers.length === 0 ? (
                            <Text style={styles.textSoft}>Alle spillere har svaret.</Text>
                          ) : (
                            <View style={{ marginTop: 4, gap: 6 }}>
                              {pendingPlayers.map((p) => (
                                <View key={p.email} style={styles.pendingRow}>
                                  <Text style={styles.pendingName}>
                                    {p.name ?? p.email}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {selected.signup_mode === "availability" && pendingPlayers.length > 0 && (
                            <Pressable
                              onPress={sendReminderToPendingPlayers}
                              style={[styles.secondaryButton, { marginTop: 10 }]}
                            >
                              <Text style={styles.secondaryButtonText}>Ryk spillere</Text>
                            </Pressable>
                          )}                          

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
                      
                      <View style={{ marginTop: 20 }}>
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
                      </View>

                    </ScrollView>
                  </KeyboardAvoidingView>
                </View>

                {/* Knapperne står fast under scrolleren */}
                <View style={{ marginTop: 15 }}>
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
                </View>

                <View style={{ marginTop: 12, gap: 8 }}>
                  <Pressable
                    onPress={() => setSelected(null)}
                    disabled={saving || deleting}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>Luk uden at gemme</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function TextInputLike(props: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  onFocus?: () => void;
}) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        onFocus={props.onFocus}
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
    flex: 1,
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  editTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  editLabel: {
    color: COLORS.textSoft,
    fontSize: 12,
    marginTop: 6,
    fontWeight: "700",
  },
  inputWrap: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inputLabel: { color: COLORS.textSoft, fontSize: 12, marginBottom: 10, fontWeight: "700", },
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
    marginBottom: 4,
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
    fontSize: 11,
    fontWeight: "500",
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
  pendingRow: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pendingName: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "500",
  },
  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },

  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  toggleChipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.55)",
  },

  toggleChipText: {
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: "700",
  },

  toggleChipTextActive: {
    color: COLORS.accent,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  modeChipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.55)",
  },

  modeChipText: {
    color: COLORS.textSoft,
    fontSize: 11,
    fontWeight: "500",
  },

  modeChipTextActive: {
    color: COLORS.accent,
  },
  helpText: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 10,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
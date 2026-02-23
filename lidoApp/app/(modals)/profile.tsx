import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";
import { Ionicons } from "@expo/vector-icons";

type ProfileRow = { role: string; is_admin: boolean; name: string | null };

const ROLES = ["admin", "kaptajn", "spiller"] as const;
type Role = (typeof ROLES)[number];

// ✅ Fixer TS bøvl med Ionicons-name
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export default function ProfileModal() {
  const { session } = useSession();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // UI state: main / create / players / edit players
  const [mode, setMode] = useState<
    | "main"
    | "create"
    | "players"
    | "edit"
    | "teams"
    | "teamDetail"
    | "selectCaptain"
    | "selectTeamPlayer"
    | "createMatch"
  >("main");


  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Roller ved oprettelse
  const [roleAdmin, setRoleAdmin] = useState(false);
  const [roleCaptain, setRoleCaptain] = useState(false);
  // spiller er altid aktiv – vi laver ikke en toggle til den
  const [rolePlayer] = useState(true);
  // Holdvalg til kaptajn (max 1)
  const [selectedCaptainTeamId, setSelectedCaptainTeamId] = useState<string | null>(null);
  // Holdvalg til spiller (0..n)
const [selectedPlayerTeamIds, setSelectedPlayerTeamIds] = useState<string[]>([]);

  const [creating, setCreating] = useState(false);

  // Players list state
  const [players, setPlayers] = useState<Array<{ email: string; name: string | null; role: string }>>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  // Teams list state
  const [teams, setTeams] = useState<
  Array<{ id: string; name: string; captain_email: string | null }>>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Create match state
  const [matchTeamId, setMatchTeamId] = useState<string | null>(null);
  const [matchDate, setMatchDate] = useState("");   // "2025-03-10"
  const [matchTime, setMatchTime] = useState("");   // "19:30"
  const [matchIsHome, setMatchIsHome] = useState<null | boolean>(true); // true = hjemme, false = ude
  const [matchLeague, setMatchLeague] = useState("");
  const [matchOpponent, setMatchOpponent] = useState("");
  const [matchType, setMatchType] = useState("");   // fx "Turnering", "Træningskamp"
  const [matchNotes, setMatchNotes] = useState("");
  const [signupMode, setSignupMode] = useState<"availability" | "preselected" | "locked">("availability");
  const [matchTeamPlayers, setMatchTeamPlayers] = useState<Array<{ email: string; name: string | null }>>([]);
  const [matchTeamPlayersLoading, setMatchTeamPlayersLoading] = useState(false);
  const [matchSelectedPlayers, setMatchSelectedPlayers] = useState<string[]>([]);
  const [creatingMatch, setCreatingMatch] = useState(false);

  // Global badge-oversigt for ALLE brugere (ikke kun mig selv)
  const [captainEmails, setCaptainEmails] = useState<Set<string>>(new Set());
  const [playerEmails, setPlayerEmails] = useState<Set<string>>(new Set());

  // Helper til at nulstille opret kamp formen
  const resetCreateMatchForm = () => {
    setMatchTeamId(null);
    setMatchDate("");
    setMatchTime("");
    setMatchIsHome(true);
    setMatchLeague("");
    setMatchOpponent("");
    setMatchType("");
    setMatchNotes("");
    setSignupMode("availability");
    setMatchTeamPlayers([]);
    setMatchSelectedPlayers([]);
  };

  // Helper til at få badges for en vilkårlig bruger
  const getBadgesForUser = (email: string, role: string | null) => {
    const mail = (email || "").toLowerCase();
    const r = (role || "").toLowerCase();

    const admin = r === "admin";
    const captain = captainEmails.has(mail);
    const player = playerEmails.has(mail);

    return { admin, captain, player };
  };

  const renderBadgesSmall = (badges: { admin: boolean; captain: boolean; player: boolean }) => {
    return (
      <View style={styles.badgeRowSmall}>
        {badges.admin && (
          <Ionicons
            name="shield-checkmark-outline"
            size={14}
            color={COLORS.accent}
            style={{ marginRight: 4 }}
          />
        )}
        {badges.captain && (
          <Ionicons
            name="flag-outline"
            size={14}
            color="#7FB2FF"
            style={{ marginRight: 4 }}
          />
        )}
        {badges.player && (
          <Ionicons
            name="navigate-outline"
            size={14}
            color="#3EE08E"
          />
        )}
      </View>
    );
  };

  // Selected team detail
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null);
  const [teamCaptain, setTeamCaptain] = useState<{ email: string; name: string | null; role: string } | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<Array<{ email: string; name: string | null; role: string }>>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [badges, setBadges] = useState({
    admin: false,
    captain: false,
    player: false,
  });


// Edit player state
const [selectedPlayer, setSelectedPlayer] = useState<{ email: string; name: string | null; role: string } | null>(null);
const [editName, setEditName] = useState("");
const [savingEdit, setSavingEdit] = useState(false);
const [deleting, setDeleting] = useState(false);

// 🔹 NYT – hvilke hold er spilleren kaptajn / spiller på?
const [editCaptainTeams, setEditCaptainTeams] = useState<Array<{ id: string; name: string }>>([]);
const [editPlayerTeams, setEditPlayerTeams] = useState<Array<{ id: string; name: string }>>([]);

// 🔹 NYT – er spilleren admin?
const [editIsAdmin, setEditIsAdmin] = useState(false);


  const { width: screenW } = useWindowDimensions();

  // Side-sheet bredde (justér her)
  const panelW = useMemo(() => Math.min(Math.round(screenW * 0.67), 390), [screenW]);
  const offscreenX = panelW + 24; // altid helt udenfor skærmen

  const panelX = useRef(new Animated.Value(offscreenX)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const open = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(panelX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    const run = async () => {
      if (!session?.user?.id) return;

      setProfileLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("role,is_admin,name")
        .eq("id", session.user.id)
        .single();

      if (!error) setProfile(data);
      setProfileLoading(false);
    };
    loadTeams();
    run();
  }, [session?.user?.id]);

  useEffect(() => {
    const loadMatchTeamPlayers = async () => {
      if (!matchTeamId) {
        setMatchTeamPlayers([]);
        setMatchSelectedPlayers([]);
        return;
      }

      setMatchTeamPlayersLoading(true);

      // 1) find emails på spillere på det valgte hold
      const { data: links, error: linksErr } = await supabase
        .from("team_players")
        .select("email")
        .eq("team_id", matchTeamId);

      if (linksErr) {
        console.log("loadMatchTeamPlayers error", linksErr.message);
        setMatchTeamPlayers([]);
        setMatchTeamPlayersLoading(false);
        return;
      }

      const emails = (links ?? []).map((l) => l.email as string);

      if (emails.length === 0) {
        setMatchTeamPlayers([]);
        setMatchSelectedPlayers([]);
        setMatchTeamPlayersLoading(false);
        return;
      }

      // 2) hent navnene fra allowed_users
      const { data: users, error: usersErr } = await supabase
        .from("allowed_users")
        .select("email,name")
        .in("email", emails);

      if (usersErr) {
        console.log("loadMatchTeamPlayers users error", usersErr.message);
        setMatchTeamPlayers([]);
        setMatchTeamPlayersLoading(false);
        return;
      }

      const rows = (users ?? []) as { email: string; name: string | null }[];

      setMatchTeamPlayers(rows);
      setMatchSelectedPlayers([]); // nulstil valg når man skifter hold
      setMatchTeamPlayersLoading(false);
    };

    loadMatchTeamPlayers();
  }, [matchTeamId]);

  useEffect(() => {
    const loadBadges = async () => {
      if (!session?.user?.email) return;

      const email = session.user.email.toLowerCase();

      const admin = !!profile?.is_admin;

      const [{ data: captainTeams, error: capErr }, { data: playerRows, error: playerErr }] =
        await Promise.all([
          supabase.from("teams").select("id").eq("captain_email", email),
          supabase.from("team_players").select("team_id").eq("email", email),
        ]);

      if (capErr || playerErr) {
        // vi gider ikke larme med fejl her – det er bare badges
        return;
      }

      const captain = (captainTeams ?? []).length > 0;
      const player = (playerRows ?? []).length > 0;

      setBadges({ admin, captain, player });
    };

    if (!profileLoading) {
      loadBadges();
    }
  }, [profileLoading, profile?.is_admin, session?.user?.email]);


  useEffect(() => {
    if (mode === "players") {
      loadPlayers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);


  const close = () => {
    // reset UI så den altid åbner i main
    setMode("main");

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 110, // overlay forsvinder lidt hurtigere
        useNativeDriver: true,
      }),
      Animated.timing(panelX, {
        toValue: offscreenX,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => router.dismiss());
  };

  useEffect(() => {
    panelX.setValue(offscreenX);
    overlayOpacity.setValue(0);
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offscreenX]);

  useEffect(() => {
    if (
      mode === "players" ||
      mode === "selectCaptain" ||
      mode === "selectTeamPlayer" ||
      mode === "teamDetail"
    ) {
      loadPlayers();
    }
    if (mode === "teams") {
      loadTeams();
    }
    // teamDetail loader selv via openTeamDetail
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const logout = async () => {
    await supabase.auth.signOut();
    close();
  };

  const primaryRole: Role = (() => {
    if (badges.admin) return "admin";
    if (badges.captain) return "kaptajn";
    return "spiller";
  })();


  const roleIcon = useMemo((): { name: IoniconName; color: string } => {
    if (primaryRole === "admin") return { name: "shield-checkmark-outline", color: COLORS.accent };
    if (primaryRole === "kaptajn") return { name: "flag-outline", color: "#7FB2FF" };
    return { name: "navigate-outline", color: "#3EE08E" };
  }, [primaryRole]);


  const roleMeta = (role: string) => {
    const r = (role || "").toLowerCase();
    if (r === "admin") return { name: "shield-checkmark-outline" as const, color: COLORS.accent };
    if (r === "kaptajn") return { name: "flag-outline" as const, color: "#7FB2FF" }; // “kaptajn” badge
    return { name: "navigate-outline" as const, color: "#3EE08E" }; // “spiller” (dart/pil vibe)
  };

  const roleRank = (role: string) => {
    const r = (role || "").toLowerCase();
    if (r === "admin") return 0;
    if (r === "kaptajn") return 1;
    return 2; // spiller + alt andet
  };

// Læg dette et sted efter dine andre helpers, fx under roleRank:
const getBadgesForUserOnTeam = (
  user: { email: string; role: string },
  teamId?: string
  ) => {
  const email = (user.email || "").toLowerCase();

  // admin er global – vi bruger stadig allowed_users.role til det
  const isAdmin = (user.role || "").toLowerCase() === "admin";

  // kaptajn: kun hvis personen er kaptajn for DETTE hold
  const isCaptainHere =
    !!teamId &&
    !!teamCaptain &&
    teamCaptain.email.toLowerCase() === email &&
    selectedTeam?.id === teamId;

  // spiller: i "Spillere" på et hold er de med i listen → så ja
  const isPlayerHere = true;

  return { isAdmin, isCaptainHere, isPlayerHere };
};

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setRoleAdmin(false);
    setRoleCaptain(false);
    setSelectedCaptainTeamId(null);
    setSelectedPlayerTeamIds([]);   // ✅ vigtigt
  };

  const createAllowedUser = async () => {
    const email = newEmail.trim().toLowerCase();
    const name = newName.trim();

    if (!name || !email) {
      Alert.alert("Mangler", "Udfyld navn og email.");
      return;
    }

    // spiller er altid valgt, så vi kræver ikke ekstra her
    // men kaptajn MÅ ikke vælges uden et hold
    if (roleCaptain && !selectedCaptainTeamId) {
      Alert.alert("Mangler", "Vælg et hold til kaptajn, eller slå kaptajn fra.");
      return;
    }

    // primær rolle (til p_role)
    const primaryRole: Role = roleAdmin ? "admin" : roleCaptain ? "kaptajn" : "spiller";

    setCreating(true);

    // 1) Opret/whitelist brugeren
    const { error: userError } = await supabase.rpc("admin_upsert_allowed_user", {
      p_email: email,
      p_name: name,
      p_role: primaryRole,
    });

    if (userError) {
      setCreating(false);
      Alert.alert("Fejl", userError.message);
      return;
    }

    // 2) Tilføj som spiller på valgte hold
    for (const teamId of selectedPlayerTeamIds) {
      const { error: tpError } = await supabase
        .from("team_players")
        .insert({ team_id: teamId, email });

      // Ignorér "duplicate" hvis du kører op igen
      if (tpError && !tpError.message.toLowerCase().includes("duplicate")) {
        setCreating(false);
        Alert.alert("Fejl", tpError.message);
        return;
      }
    }

    // 3) Sæt kaptajn på valgte hold (men IKKE som spiller automatisk)
    if (roleCaptain && selectedCaptainTeamId) {
      const { error: capError } = await supabase
        .from("teams")
        .update({ captain_email: email })
        .eq("id", selectedCaptainTeamId);

      if (capError) {
        setCreating(false);
        Alert.alert("Fejl", capError.message);
        return;
      }
      await loadTeams();   // 🔁 refresh så create-view ser den nye kaptajn
    }

    setCreating(false);

    Alert.alert(
      "Oprettet ✅",
      `${name} er nu oprettet som ${primaryRole}${
        selectedPlayerTeamIds.length ? " og tilknyttet hold" : ""
      }.`
    );

    resetCreateForm();
    setMode("main");
  };

  const createMatch = async () => {
    if (!matchTeamId) {
      Alert.alert("Mangler", "Vælg hvilket hold kampen hører til.");
      return;
    }

    if (!matchDate || !matchTime) {
      Alert.alert("Mangler", "Udfyld dato og tidspunkt.");
      return;
    }

    if (matchIsHome === null) {
      Alert.alert("Mangler", "Vælg om kampen er hjemme eller ude.");
      return;
    }

    if (!matchOpponent.trim()) {
      Alert.alert("Mangler", "Skriv modstanderens navn.");
      return;
    }

    // Hvis vi har valgt "Sæt hold", skal der være mindst én spiller
    if (signupMode === "preselected" && matchSelectedPlayers.length === 0) {
      Alert.alert("Mangler", "Vælg mindst én spiller til kampen.");
      return;
    }

    // "2026-03-14" + "11:00"
    const isoString = `${matchDate}T${matchTime}:00`;
    const parsed = new Date(isoString);

    if (isNaN(parsed.getTime())) {
      Alert.alert(
        "Ugyldig dato/tid",
        "Tjek at dato og tidspunkt er gyldigt (fx 2025-03-10 og 19:30)."
      );
      return;
    }

    const preselectedEmails =
      signupMode === "preselected"
        ? matchSelectedPlayers.map((e) => e.toLowerCase().trim())
        : null;

    setCreatingMatch(true);
    try {
      const { data, error } = await supabase.rpc("admin_create_match", {
        p_team_id: matchTeamId,
        p_start_at: parsed.toISOString(),
        p_is_home: matchIsHome,
        p_league: matchLeague || null,
        p_opponent: matchOpponent,
        p_match_type: matchType || null,
        p_notes: matchNotes || null,
        p_signup_mode: signupMode,
        p_preselected_emails: preselectedEmails,
      });

      if (error) {
        Alert.alert("Fejl", error.message);
        return;
      }

      Alert.alert("Kamp oprettet ✅", "Kampen er nu oprettet for holdet.");
      resetCreateMatchForm();
      setMode("teams");
      await loadTeams();
    } finally {
      setCreatingMatch(false);
    }
  };

  const loadPlayers = async () => {
    setPlayersLoading(true);

    const { data, error } = await supabase
      .from("allowed_users")
      .select("email,name,role");

    if (error) {
      setPlayersLoading(false);
      Alert.alert("Fejl", error.message);
      return;
    }

    const baseList = (data ?? []) as { email: string; name: string | null; role: string }[];

    // alle emails i lower-case
    const emails = baseList.map((p) => (p.email || "").toLowerCase());

    const [{ data: capRows, error: capErr }, { data: playerRows, error: playerErr }] =
      await Promise.all([
        supabase
          .from("teams")
          .select("captain_email")
          .in("captain_email", emails),
        supabase
          .from("team_players")
          .select("email")
          .in("email", emails),
      ]);

    if (capErr || playerErr) {
      // vi vil ikke crashe viewet her – viser bare uden ekstra badges
      console.log("badge fetch error", capErr?.message, playerErr?.message);
    }

    const captainSet = new Set(
      (capRows ?? [])
        .map((r: any) => (r.captain_email || "").toLowerCase())
        .filter(Boolean)
    );
    const playerSet = new Set(
      (playerRows ?? [])
        .map((r: any) => (r.email || "").toLowerCase())
        .filter(Boolean)
    );

    // gem til brug i alle views
    setCaptainEmails(captainSet);
    setPlayerEmails(playerSet);

    // sortér som før
    const list = baseList.slice().sort((a, b) => {
      const rr = roleRank(a.role) - roleRank(b.role);
      if (rr !== 0) return rr;

      const an = (a.name?.trim() || a.email || "").toLowerCase();
      const bn = (b.name?.trim() || b.email || "").toLowerCase();
      return an.localeCompare(bn, "da");
    });

    setPlayers(list as any);
    setPlayersLoading(false);
  };

  const loadTeams = async () => {
    setTeamsLoading(true);

    const { data, error } = await supabase
      .from("teams")
      .select("id,name,captain_email")
      .order("name", { ascending: true });

    setTeamsLoading(false);

    if (error) {
      Alert.alert("Fejl", error.message);
      return;
    }

    setTeams((data ?? []) as any);
  };

  const loadTeamDetail = async (teamId: string) => {
    setTeamLoading(true);
    setTeamCaptain(null);
    setTeamPlayers([]);

    // 1) hent team med kaptajn-email
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id,name,captain_email")
      .eq("id", teamId)
      .single();

    if (teamError) {
      setTeamLoading(false);
      Alert.alert("Fejl", teamError.message);
      return;
    }

    // hold navn opdateret fra DB
    setSelectedTeam({ id: team.id, name: team.name });

    // 2) hent emails på spillere på holdet
    const { data: links, error: linksError } = await supabase
      .from("team_players")
      .select("email")
      .eq("team_id", teamId);

    if (linksError) {
      setTeamLoading(false);
      Alert.alert("Fejl", linksError.message);
      return;
    }

    const playerEmails = (links ?? []).map((l) => l.email as string);

    // 3) byg liste af emails der skal hentes fra allowed_users
    const emailsToFetch = new Set<string>();
    if (team.captain_email) emailsToFetch.add(team.captain_email.toLowerCase());
    playerEmails.forEach((e: string) => emailsToFetch.add(e.toLowerCase()));

    let allowedRows: { email: string; name: string | null; role: string }[] = [];

    if (emailsToFetch.size > 0) {
      const { data: allowed, error: allowedError } = await supabase
        .from("allowed_users")
        .select("email,name,role")
        .in("email", Array.from(emailsToFetch));

      if (allowedError) {
        setTeamLoading(false);
        Alert.alert("Fejl", allowedError.message);
        return;
      }

      allowedRows = (allowed ?? []) as any;
    }

    // 4) find kaptajn
    if (team.captain_email) {
      const cap = allowedRows.find(
        (r) => r.email.toLowerCase() === team.captain_email.toLowerCase()
      );
      if (cap) {
        setTeamCaptain(cap);
      } else {
        setTeamCaptain(null);
      }
    } else {
      setTeamCaptain(null);
    }

    // 5) byg spillerliste
    const playersForTeam = playerEmails
      .map((pe) =>
        allowedRows.find((r) => r.email.toLowerCase() === (pe || "").toLowerCase())
      )
      .filter(Boolean) as { email: string; name: string | null; role: string }[];

    setTeamPlayers(playersForTeam);
    setTeamLoading(false);
  };

  const openTeamDetail = (team: { id: string; name: string }) => {
    setSelectedTeam(team);
    setMode("teamDetail");
    loadTeamDetail(team.id);
  };


const setCaptainForTeam = async (player: { email: string; name: string | null; role: string }) => {
  if (!selectedTeam) return;

  const email = player.email.toLowerCase();

  // 1) Sæt kaptajn på det valgte hold
  const { error } = await supabase
    .from("teams")
    .update({ captain_email: email })
    .eq("id", selectedTeam.id);

  if (error) {
    Alert.alert("Fejl", error.message);
    return;
  }

  // 2) Sørg for at allowed_users.role afspejler at personen nu er kaptajn
  await syncCaptainRoleForEmail(email);

  // 3) Reload detail og tilbage til team view
  await loadTeamDetail(selectedTeam.id);
  setMode("teamDetail");
};


const clearCaptainForTeam = async () => {
  if (!selectedTeam || !teamCaptain) return;

  const email = teamCaptain.email.toLowerCase();

  // 1) Fjern kaptajn på det aktuelle hold
  const { error } = await supabase
    .from("teams")
    .update({ captain_email: null })
    .eq("id", selectedTeam.id);

  if (error) {
    Alert.alert("Fejl", error.message);
    return;
  }

  // 2) Tjek om personen stadig er kaptajn for andre hold.
  //    Hvis ikke → nedgradér til spiller (medmindre admin).
  await syncCaptainRoleForEmail(email);

  // 3) Reload detail view
  await loadTeamDetail(selectedTeam.id);
};


const addPlayerToTeam = async (player: { email: string; name: string | null; role: string }) => {
  if (!selectedTeam) return;

  const email = player.email.toLowerCase();

  const { error } = await supabase
    .from("team_players")
    .insert({ team_id: selectedTeam.id, email });

  if (error) {
    // hvis det allerede findes pga primary key, er det ikke en katastrofe
    if (!error.message.includes("duplicate key")) {
      Alert.alert("Fejl", error.message);
      return;
    }
  }

  await loadTeamDetail(selectedTeam.id);
  setMode("teamDetail");
};

const loadEditPlayerTeams = async (email: string) => {
  const lower = email.toLowerCase();

  // 1) hold hvor spilleren er kaptajn
  const { data: capTeams, error: capErr } = await supabase
    .from("teams")
    .select("id,name")
    .eq("captain_email", lower);

  if (capErr) {
    Alert.alert("Fejl", capErr.message);
    return;
  }

  setEditCaptainTeams((capTeams ?? []) as Array<{ id: string; name: string }>);

  // 2) hold hvor spilleren er spiller
  const { data: links, error: linksErr } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("email", lower);

  if (linksErr) {
    Alert.alert("Fejl", linksErr.message);
    return;
  }

  const teamIds = Array.from(new Set((links ?? []).map((l: any) => l.team_id)));

  if (teamIds.length === 0) {
    setEditPlayerTeams([]);
    return;
  }

  const { data: playerTeams, error: teamsErr } = await supabase
    .from("teams")
    .select("id,name")
    .in("id", teamIds);

  if (teamsErr) {
    Alert.alert("Fejl", teamsErr.message);
    return;
  }

  setEditPlayerTeams((playerTeams ?? []) as Array<{ id: string; name: string }>);
};

// Holder allowed_users.role i sync med om en bruger faktisk er kaptajn for nogen hold
const syncCaptainRoleForEmail = async (rawEmail: string) => {
  const email = (rawEmail || "").toLowerCase();
  if (!email) return;

  // 1) Find nuværende rolle
  const { data: user, error: userErr } = await supabase
    .from("allowed_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (userErr || !user) {
    // hvis brugeren ikke findes mere, gør vi bare ingenting
    return;
  }

  // Admin skal aldrig nedgraderes automatisk
  if (user.role === "admin") return;

  // 2) Tjek om brugeren stadig er kaptajn for mindst ét hold
  const { data: capTeams, error: capErr } = await supabase
    .from("teams")
    .select("id")
    .eq("captain_email", email);

  if (capErr) {
    // vi larmer ikke i UI – det er "nice to have"
    return;
  }

  const stillCaptain = (capTeams ?? []).length > 0;

  // 3) Beregn ønsket rolle
  const desiredRole: Role = stillCaptain ? "kaptajn" : "spiller";

  if (user.role === desiredRole) {
    // Allerede korrekt, ingen grund til at skrive til DB
    return;
  }

  await supabase
    .from("allowed_users")
    .update({ role: desiredRole })
    .eq("email", email);
};

const removePlayerFromTeam = async (player: { email: string; name: string | null; role: string }) => {
  if (!selectedTeam) return;

  const email = player.email.toLowerCase();

  const { error } = await supabase
    .from("team_players")
    .delete()
    .eq("team_id", selectedTeam.id)
    .eq("email", email);

  if (error) {
    Alert.alert("Fejl", error.message);
    return;
  }

  await loadTeamDetail(selectedTeam.id);
};



const openEditPlayer = (p: { email: string; name: string | null; role: string }) => {
  setSelectedPlayer(p);
  setEditName((p.name ?? "").trim());

  // 🔹 er spilleren admin lige nu?
  const isAdmin = (p.role || "").toLowerCase() === "admin";
  setEditIsAdmin(isAdmin);

  // 🔹 hent de hold spilleren er knyttet til
  loadEditPlayerTeams(p.email);

  setMode("edit");
};

const savePlayerEdits = async () => {
  if (!selectedPlayer) return;

  const name = editName.trim();
  if (!name) {
    Alert.alert("Mangler", "Navn må ikke være tomt.");
    return;
  }

  setSavingEdit(true);
  const { error } = await supabase.rpc("admin_update_allowed_user", {
    p_email: selectedPlayer.email,
    p_name: name,
    // 🔹 behold nuværende role-værdi uændret
    p_role: selectedPlayer.role,
  });
  setSavingEdit(false);

  if (error) {
    Alert.alert("Fejl", error.message);
    return;
  }

  Alert.alert("Gemt ✅", "Spilleren er opdateret.");

  await loadPlayers(); // refresh liste

  // opdater local selectedPlayer, så UI matcher
  setSelectedPlayer((prev) =>
    prev ? { ...prev, name } : prev
  );

  setMode("players");
};

const deletePlayer = async () => {
  if (!selectedPlayer) return;

  Alert.alert(
    "Slet spiller?",
    `Er du sikker på at du vil fjerne "${selectedPlayer.name ?? selectedPlayer.email}" fra systemet?`,
    [
      { text: "Annuller", style: "cancel" },
      {
        text: "Slet",
        style: "destructive",
        onPress: async () => {
          const email = selectedPlayer.email.toLowerCase();

          setDeleting(true);

          // 1) Fjern som spiller på ALLE hold
          const { error: tpErr } = await supabase
            .from("team_players")
            .delete()
            .eq("email", email);

          if (tpErr) {
            setDeleting(false);
            Alert.alert("Fejl", tpErr.message);
            return;
          }

          // 2) Nulstil kaptajn på alle hold hvor personen er kaptajn
          const { error: capErr } = await supabase
            .from("teams")
            .update({ captain_email: null })
            .eq("captain_email", email);

          if (capErr) {
            setDeleting(false);
            Alert.alert("Fejl", capErr.message);
            return;
          }

          // 3) Kald din eksisterende RPC til at fjerne fra allowed_users (+ evt. auth)
          const { error: delErr } = await supabase.rpc("admin_delete_allowed_user", {
            p_email: selectedPlayer.email,
          });

          setDeleting(false);

          if (delErr) {
            Alert.alert("Fejl", delErr.message);
            return;
          }

          Alert.alert("Slettet ✅", "Spilleren er fjernet fra whitelisten og alle hold.");

          await Promise.all([
            loadPlayers(),
            loadTeams(), // så kaptajn-info / holdene også er friske
          ]);

          setSelectedPlayer(null);
          setMode("players");
        },
      },
    ]
  );
};

const grantAdminToPlayer = async () => {
  if (!selectedPlayer) return;

  Alert.alert(
    "Giv admin?",
    `Er du sikker på at du vil give admin-rettigheder til "${selectedPlayer.name ?? selectedPlayer.email}"?`,
    [
      { text: "Annuller", style: "cancel" },
      {
        text: "Giv admin",
        style: "destructive",
        onPress: async () => {
          const name = (editName.trim() || selectedPlayer.name || "").trim();

          const { error } = await supabase.rpc("admin_update_allowed_user", {
            p_email: selectedPlayer.email,
            p_name: name,
            p_role: "admin",
          });

          if (error) {
            Alert.alert("Fejl", error.message);
            return;
          }

          // opdatér local state så UI er friskt
          setEditIsAdmin(true);
          setSelectedPlayer((prev) =>
            prev ? { ...prev, role: "admin", name } : prev
          );

          await loadPlayers();

          Alert.alert("Opdateret ✅", "Brugeren er nu admin.");
        },
      },
    ]
  );
};

  return (
    <View style={styles.root}>
      {/* Overlay */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayOpacity }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}

        <View
          style={[
            styles.overlayTint,
            {
              backgroundColor:
                Platform.OS === "ios" ? "rgba(0,0,0,0.12)" : "rgba(10,14,20,0.55)",
            },
          ]}
        />

        <Pressable style={styles.overlayPress} onPress={close} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            width: panelW,
            transform: [{ translateX: panelX }],
          },
        ]}
      >
        <SafeAreaView style={styles.panelInner} edges={["top", "bottom"]}>
          {/* ✅ Header bliver ALTID den samme (profil + badge + email) */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {profile?.name ?? "Profil"}
                </Text>

                {!profileLoading && (
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
                        style={{ marginRight: 6 }}
                      />
                    )}

                    {/* Teksten er kun den “højeste” rolle */}
                    <Text style={styles.roleBadgeText}>{primaryRole}</Text>
                  </View>
                )}
              </View>


              <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                {session?.user?.email ?? ""}
              </Text>
            </View>

            <Pressable onPress={close} hitSlop={12} style={styles.iconButton}>
              <Ionicons name="close" size={20} color={COLORS.textSoft} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {mode === "main" ? (
            <>
              <View style={{ gap: 10 }}>
                <View style={styles.row}>
                  <View style={styles.roleIcon}>
                    <Ionicons name="mail-outline" size={18} color={COLORS.accent} />
                  </View>
                  <Text style={styles.rowText} numberOfLines={1} ellipsizeMode="middle">
                    {session?.user?.email ?? "—"}
                  </Text>
                </View>

                {/* Admin-only */}
                {!profileLoading && profile?.is_admin ? (
                  <Pressable onPress={() => setMode("create")} style={styles.adminButton}>
                    <Ionicons name="person-add-outline" size={18} color={COLORS.text} />
                    <Text style={styles.adminButtonText}>Opret spiller</Text>
                  </Pressable>
                ) : null}

                {/* Admin-only */}
                {!profileLoading && profile?.is_admin ? (
                  <Pressable onPress={() => setMode("players")} style={styles.adminButton}>
                    <Ionicons name="people-outline" size={18} color={COLORS.text} />
                    <Text style={styles.adminButtonText}>Spillere</Text>
                  </Pressable>
                ) : null}

                {/* Admin-only */}
                {!profileLoading && profile?.is_admin ? (
                  <Pressable onPress={() => setMode("teams")} style={styles.adminButton}>
                    <Ionicons name="layers-outline" size={18} color={COLORS.text} />
                    <Text style={styles.adminButtonText}>Hold</Text>
                  </Pressable>
                ) : null}

                {/* Admin-only */}
                {!profileLoading && profile?.is_admin ? (
                  <Pressable onPress={() => setMode("createMatch")} style={styles.adminButton}>
                    <Ionicons name="calendar-outline" size={18} color={COLORS.text} />
                    <Text style={styles.adminButtonText}>Opret kamp</Text>
                  </Pressable>
                ) : null}

              </View>

              <View style={{ flex: 1 }} />

              <Pressable onPress={logout} style={styles.primaryButton}>
                <Ionicons name="log-out-outline" size={18} color={COLORS.bg} />
                <Text style={styles.primaryButtonText}>Log ud</Text>
              </Pressable>

              <Pressable onPress={close} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Luk</Text>
              </Pressable>
            </>
          ) : mode === "create" ? (
            <>
              {/* Header-tekst under profil-headeren */}
              <Text style={styles.sectionTitle}>Opret spiller</Text>

              {/* Alt indhold over knapperne */}
              <View style={{ flex: 1, gap: 10 }}>
                {/* Navn */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Navn</Text>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Fx Mikkel Jensen"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>

                {/* Email */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="mail@domæne.dk"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                {/* ↓↓↓ Kun denne del er scrollable ↓↓↓ */}
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{
                    gap: 10,
                    paddingBottom: 12, // lidt luft til knapperne
                  }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Rolle */}
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>Rolle</Text>

                    <View style={styles.rolePicker}>
                      {/* admin – toggle */}
                      <Pressable
                        onPress={() => setRoleAdmin((v) => !v)}
                        style={[styles.roleChip, roleAdmin && styles.roleChipActive]}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            roleAdmin && styles.roleChipTextActive,
                          ]}
                        >
                          admin
                        </Text>
                      </Pressable>

                      {/* kaptajn – toggle */}
                      <Pressable
                        onPress={() => setRoleCaptain((v) => !v)}
                        style={[styles.roleChip, roleCaptain && styles.roleChipActive]}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            roleCaptain && styles.roleChipTextActive,
                          ]}
                        >
                          kaptajn
                        </Text>
                      </Pressable>

                      {/* spiller – altid aktiv */}
                      <Pressable style={[styles.roleChip, styles.roleChipActive]}>
                        <Text
                          style={[
                            styles.roleChipText,
                            styles.roleChipTextActive,
                          ]}
                        >
                          spiller
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Kaptajn-hold */}
                  {roleCaptain && (
                    <View style={[styles.inputWrap, { marginTop: 10 }]}>
                      <Text style={styles.inputLabel}>Vælg hold til kaptajn</Text>

                      {teams.length === 0 ? (
                        <Text style={styles.helpText}>Ingen hold endnu.</Text>
                      ) : (
                        <View style={{ gap: 8 }}>
                          {teams.map((t) => {
                            const isSelected = selectedCaptainTeamId === t.id;
                            const hasCaptain = !!t.captain_email;

                            return (
                              <Pressable
                                key={t.id}
                                onPress={() => setSelectedCaptainTeamId(t.id)}
                                style={[
                                  styles.teamChip,
                                  isSelected && styles.teamChipActive,
                                ]}
                              >
                                <View
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <Text style={styles.teamChipText}>{t.name}</Text>
                                  <Text style={styles.teamChipSub}>
                                    {hasCaptain ? "Har kaptajn" : "Ingen kaptajn"}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Spiller-hold */}
                  <View style={[styles.inputWrap, { marginTop: 10 }]}>
                    <Text style={styles.inputLabel}>Hold som spiller</Text>

                    {teams.length === 0 ? (
                      <Text style={styles.helpText}>Ingen hold endnu.</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {teams.map((t) => {
                          const isSelected = selectedPlayerTeamIds.includes(t.id); // ✅ ens state

                          return (
                            <Pressable
                              key={t.id}
                              onPress={() =>
                                setSelectedPlayerTeamIds((prev) =>
                                  prev.includes(t.id)
                                    ? prev.filter((id) => id !== t.id) // fjern
                                    : [...prev, t.id]                  // tilføj
                                )
                              }
                              style={[
                                styles.teamChip,
                                isSelected && styles.teamChipActive,
                              ]}
                            >
                              <Text style={styles.teamChipText}>{t.name}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </ScrollView>
                {/* ↑↑↑ Kun denne del scroller ↑↑↑ */}
              </View>

              {/* Knapperne står fast i bunden */}
              <Pressable
                onPress={createAllowedUser}
                disabled={creating}
                style={[styles.primaryButton, creating && { opacity: 0.7 }]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.bg} />
                <Text style={styles.primaryButtonText}>
                  {creating ? "Opretter..." : "Opret"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  resetCreateForm();
                  setMode("main");
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          ) : mode === "createMatch" ? (
            <>
              <Text style={styles.sectionTitle}>Opret kamp</Text>

              {/* Scrollable content */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingBottom: 24,
                  gap: 10,
                }}
                showsVerticalScrollIndicator={false}
              >
                {/* Holdvalg */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Hold</Text>

                  {teams.length === 0 ? (
                    <Text style={styles.helpText}>Ingen hold oprettet endnu.</Text>
                  ) : (
                    <View style={styles.rolePicker}>
                      {teams.map((t) => {
                        const isSelected = matchTeamId === t.id;
                        return (
                          <Pressable
                            key={t.id}
                            onPress={() => setMatchTeamId(t.id)}
                            style={[
                              styles.roleChip,
                              isSelected && styles.roleChipActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.roleChipText,
                                isSelected && styles.roleChipTextActive,
                              ]}
                            >
                              {t.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Opret kamp som */}
                <View style={{ marginTop: 16 }}>
                  <Text
                    style={{
                      color: COLORS.textSoft,
                      fontSize: 13,
                      marginBottom: 8,
                    }}
                  >
                    Opret kamp som:
                  </Text>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {/* Klarmelding */}
                    <Pressable
                      onPress={() => setSignupMode("availability")}
                      style={[
                        styles.modeChip,
                        signupMode === "availability" && styles.modeChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          signupMode === "availability" && styles.modeChipTextActive,
                        ]}
                      >
                        Klarmelding
                      </Text>
                    </Pressable>

                    {/* Sæt hold */}
                    <Pressable
                      onPress={() => setSignupMode("preselected")}
                      style={[
                        styles.modeChip,
                        signupMode === "preselected" && styles.modeChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          signupMode === "preselected" && styles.modeChipTextActive,
                        ]}
                      >
                        Sæt hold
                      </Text>
                    </Pressable>

                    {/* Låst */}
                    <Pressable
                      onPress={() => setSignupMode("locked")}
                      style={[
                        styles.modeChip,
                        signupMode === "locked" && styles.modeChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          signupMode === "locked" && styles.modeChipTextActive,
                        ]}
                      >
                        Låst
                      </Text>
                    </Pressable>
                  </View>

                  <Text
                    style={{
                      color: COLORS.textSoft,
                      fontSize: 11,
                      marginTop: 6,
                    }}
                  >
                    • Klarmelding: spillere kan melde klar/ikke klar.{"\n"}
                    • Sæt hold: ingen klarmelding, kampen er sat på forhånd.{"\n"}
                    • Låst: kamp oprettet uden spillerstatus – kan frigives senere.
                  </Text>
                </View>

                                {signupMode === "preselected" && (
                  <View style={[styles.inputWrap, { marginTop: 10 }]}>
                    <Text style={styles.inputLabel}>Vælg spillere til kampen</Text>

                    {!matchTeamId ? (
                      <Text style={styles.helpText}>Vælg først et hold.</Text>
                    ) : matchTeamPlayersLoading ? (
                      <Text style={styles.helpText}>Henter spillere...</Text>
                    ) : matchTeamPlayers.length === 0 ? (
                      <Text style={styles.helpText}>
                        Der er endnu ingen spillere tilknyttet dette hold.
                      </Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {matchTeamPlayers.map((p) => {
                          const email = p.email.toLowerCase();
                          const isSelected = matchSelectedPlayers.includes(email);

                          return (
                            <Pressable
                              key={email}
                              onPress={() =>
                                setMatchSelectedPlayers((prev) =>
                                  prev.includes(email)
                                    ? prev.filter((e) => e !== email)
                                    : [...prev, email]
                                )
                              }
                              style={[
                                styles.teamChip,
                                isSelected && styles.teamChipActive,
                              ]}
                            >
                              <Text style={styles.teamChipText}>
                                {p.name ?? p.email}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {/* Dato + tid */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={[styles.inputWrap, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Dato</Text>
                    <TextInput
                      value={matchDate}
                      onChangeText={setMatchDate}
                      placeholder="2025-03-10"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.input}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={[styles.inputWrap, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Tidspunkt</Text>
                    <TextInput
                      value={matchTime}
                      onChangeText={setMatchTime}
                      placeholder="19:30"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      style={styles.input}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Hjemme / ude */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Bane</Text>
                  <View style={styles.rolePicker}>
                    <Pressable
                      onPress={() => setMatchIsHome(true)}
                      style={[
                        styles.roleChip,
                        matchIsHome === true && styles.roleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          matchIsHome === true && styles.roleChipTextActive,
                        ]}
                      >
                        Hjemme
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setMatchIsHome(false)}
                      style={[
                        styles.roleChip,
                        matchIsHome === false && styles.roleChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleChipText,
                          matchIsHome === false && styles.roleChipTextActive,
                        ]}
                      >
                        Ude
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Liga */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Liga (valgfri)</Text>
                  <TextInput
                    value={matchLeague}
                    onChangeText={setMatchLeague}
                    placeholder="Fx U15 A, 2. division"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </View>

                {/* Modstander */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Modstander</Text>
                  <TextInput
                    value={matchOpponent}
                    onChangeText={setMatchOpponent}
                    placeholder="Fx Køge, Brøndby"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>

                {/* Type */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Type (valgfri)</Text>
                  <TextInput
                    value={matchType}
                    onChangeText={setMatchType}
                    placeholder="Fx Træningskamp, Turnering"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="sentences"
                  />
                </View>

                {/* Noter */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Noter (valgfri)</Text>
                  <TextInput
                    value={matchNotes}
                    onChangeText={setMatchNotes}
                    placeholder="Ekstra info til spillerne"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={[styles.input, { minHeight: 60 }]}
                    multiline
                  />
                </View>

              </ScrollView>

              <View style={{ paddingTop: 12 }}>            
                <Pressable
                  onPress={createMatch}
                  disabled={creatingMatch}
                  style={[styles.primaryButton, creatingMatch && { opacity: 0.7 }]}
                >
                  {creatingMatch ? (
                    <Text style={styles.primaryButtonText}>Opretter...</Text>
                  ) : (
                    <Text style={styles.primaryButtonText}>Opret kamp</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    resetCreateMatchForm();
                    setMode("main");
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Tilbage</Text>
                </Pressable>
              </View>
            </>
          ) : mode === "players" ? (
            <>
              {/* Players view */}
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionTitlePlayers}>Spillere</Text>

                {playersLoading ? (
                  <Text style={styles.helpText}>Henter...</Text>
                ) : players.length === 0 ? (
                  <Text style={styles.helpText}>Ingen whitelisted endnu.</Text>
                ) : (
                  <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                    {players.map((p) => {
                      const label = (p.name?.trim() || p.email).trim();
                      const b = getBadgesForUser(p.email, p.role);

                      return (
                        <Pressable
                          key={p.email}
                          onPress={() => openEditPlayer(p)}
                          style={styles.playerRow}
                        >
                          <View style={styles.playerLeft}>
                            <Text style={styles.playerName} numberOfLines={1}>
                              {label}
                            </Text>
                            {renderBadgesSmall(b)}
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={COLORS.textSoft}
                            style={{ opacity: 0.5 }}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={() => setMode("main")}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          ) : mode === "teams" ? (
            <>
              {/* Teams view */}
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionTitle}>Opret hold</Text>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Holdnavn</Text>
                  <TextInput
                    value={newTeamName}
                    onChangeText={setNewTeamName}
                    placeholder="Fx Lido 1"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>

                <Pressable
                  onPress={async () => {
                    const name = newTeamName.trim();
                    if (!name) {
                      Alert.alert("Mangler", "Skriv et navn til holdet.");
                      return;
                    }

                    setCreatingTeam(true);
                    const { error } = await supabase
                      .from("teams")
                      .insert({ name });
                    setCreatingTeam(false);

                    if (error) {
                      Alert.alert("Fejl", error.message);
                      return;
                    }

                    setNewTeamName("");
                    await loadTeams();
                  }}
                  disabled={creatingTeam}
                  style={[styles.primaryButton, { marginTop: 4 }, creatingTeam && { opacity: 0.7 }]}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.bg} />
                  <Text style={styles.primaryButtonText}>
                    {creatingTeam ? "Opretter..." : "Opret hold"}
                  </Text>
                </Pressable>

                {teamsLoading ? (
                  <Text style={styles.helpText}>Henter hold...</Text>
                ) : teams.length === 0 ? (
                  <Text style={styles.helpText}>Ingen hold oprettet endnu.</Text>
                ) : (
                  <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                    {teams.map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={() => openTeamDetail(t)}
                        style={styles.playerRow}
                      >
                        <View style={styles.playerLeft}>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {t.name}
                          </Text>
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={COLORS.textSoft}
                          style={{ opacity: 0.5 }}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={() => setMode("main")}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          ) : mode === "teamDetail" ? (
            <>
              {/* Team detail view */}
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionTitlePlayers}>
                  {selectedTeam ? selectedTeam.name : "Hold"}
                </Text>

                {/* Kaptajn sektion */}
                <Text style={styles.sectionTitle}>Holdkaptajn</Text>

                <Pressable
                  onPress={() => setMode("selectCaptain")}
                  style={styles.inputWrap}
                >
                  {teamLoading ? (
                    <Text style={styles.helpText}>Henter...</Text>
                  ) : teamCaptain ? (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.playerName} numberOfLines={1}>
                          {teamCaptain.name ?? teamCaptain.email}
                        </Text>
                        {renderBadgesSmall(getBadgesForUser(teamCaptain.email, teamCaptain.role))}
                      </View>

                      <Ionicons name="chevron-forward" size={16} color={COLORS.textSoft} style={{ opacity: 0.5 }} />
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.helpText}>Ingen kaptajn valgt</Text>
                      <Ionicons name="add-circle-outline" size={20} color={COLORS.accent} />
                    </View>
                  )}
                </Pressable>

                {/* Slet kaptajn knap hvis der er en */}
                {teamCaptain && (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        "Fjern kaptajn?",
                        "Er du sikker på at du vil fjerne denne kaptajn?",
                        [
                          { text: "Annuller", style: "cancel" },
                          {
                            text: "Fjern",
                            style: "destructive",
                            onPress: () => clearCaptainForTeam(),
                          },
                        ]
                      )
                    }
                    style={styles.dangerButton}
                  >
                    <Ionicons name="trash-outline" size={16} color={COLORS.text} />
                    <Text style={styles.dangerButtonText}>Fjern kaptajn</Text>
                  </Pressable>
                )}

                {/* Spillere på holdet */}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Spillere</Text>

                {teamLoading ? (
                  <Text style={styles.helpText}>Henter spillere...</Text>
                ) : teamPlayers.length === 0 ? (
                  <Text style={styles.helpText}>Ingen spillere på holdet endnu.</Text>
                ) : (
                  <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                    {teamPlayers.map((p) => {
                      const label = (p.name?.trim() || p.email).trim();
                      const { isAdmin, isCaptainHere, isPlayerHere } =
                        getBadgesForUserOnTeam(p, selectedTeam?.id);

                      return (
                        <View key={p.email} style={styles.playerRow}>
                          <View style={styles.playerLeft}>
                            <Text style={styles.playerName} numberOfLines={1}>
                              {label}
                            </Text>

                            {/* admin badge */}
                            {isAdmin && (
                              <Ionicons
                                name="shield-checkmark-outline"
                                size={16}
                                color={COLORS.accent}
                                style={{ marginLeft: 8 }}
                              />
                            )}

                            {/* kaptajn-badge (kun hvis kaptajn for DETTE hold) */}
                            {isCaptainHere && (
                              <Ionicons
                                name="flag-outline"
                                size={16}
                                color="#7FB2FF"
                                style={{ marginLeft: 6 }}
                              />
                            )}

                            {/* spiller-badge (de er jo spillere på det her hold) */}
                            {isPlayerHere && (
                              <Ionicons
                                name="navigate-outline"
                                size={16}
                                color="#3EE08E"
                                style={{ marginLeft: 6 }}
                              />
                            )}
                          </View>

                          {/* den røde remove-knap du allerede har */}
                          <Pressable
                            onPress={() =>
                              Alert.alert(
                                "Fjern spiller?",
                                `Er du sikker på at du vil fjerne "${label}" fra ${selectedTeam?.name}?`,
                                [
                                  { text: "Annuller", style: "cancel" },
                                  {
                                    text: "Fjern",
                                    style: "destructive",
                                    onPress: () => removePlayerFromTeam(p),
                                  },
                                ]
                              )
                            }
                            hitSlop={10}
                          >
                            <Ionicons
                              name="close-circle"
                              size={18}
                              color="rgba(255,82,82,0.9)"
                            />
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                <Pressable
                  onPress={() => setMode("selectTeamPlayer")}
                  style={[styles.primaryButton, { marginTop: 10 }]}
                >
                  <Ionicons name="person-add-outline" size={18} color={COLORS.bg} />
                  <Text style={styles.primaryButtonText}>Tilføj spiller</Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }} />

              <Pressable onPress={() => setMode("teams")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          ) : mode === "selectCaptain" ? (
            <>
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionTitlePlayers}>Vælg kaptajn</Text>

                {playersLoading ? (
                  <Text style={styles.helpText}>Henter spillere...</Text>
                ) : players.length === 0 ? (
                  <Text style={styles.helpText}>Ingen whitelistede spillere.</Text>
                ) : (
                  <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                    {players.map((p) => {
                      const label = (p.name?.trim() || p.email).trim();
                      const b = getBadgesForUser(p.email, p.role);

                      return (
                        <Pressable
                          key={p.email}
                          onPress={() => setCaptainForTeam(p)}
                          style={styles.playerRow}
                        >
                          <View style={styles.playerLeft}>
                            <Text style={styles.playerName} numberOfLines={1}>
                              {label}
                            </Text>
                            {renderBadgesSmall(b)}
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={COLORS.textSoft}
                            style={{ opacity: 0.5 }}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={{ flex: 1 }} />

              <Pressable onPress={() => setMode("teamDetail")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          ) : mode === "selectTeamPlayer" ? (
            <>
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionTitlePlayers}>Vælg spiller</Text>

                {playersLoading ? (
                  <Text style={styles.helpText}>Henter spillere...</Text>
                ) : players.length === 0 ? (
                  <Text style={styles.helpText}>Ingen whitelistede spillere.</Text>
                ) : (
                  <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
                    {players.map((p) => {
                      const label = (p.name?.trim() || p.email).trim();
                      const b = getBadgesForUser(p.email, p.role);

                      return (
                        <Pressable
                          key={p.email}
                          onPress={() => addPlayerToTeam(p)}
                          style={styles.playerRow}
                        >
                          <View style={styles.playerLeft}>
                            <Text style={styles.playerName} numberOfLines={1}>
                              {label}
                            </Text>
                            {renderBadgesSmall(b)}
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={COLORS.textSoft}
                            style={{ opacity: 0.5 }}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={{ flex: 1 }} />

              <Pressable onPress={() => setMode("teamDetail")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Edit view */}
              <Text style={styles.sectionTitlePlayers}>Rediger spiller</Text>

              <View style={{ gap: 10 }}>
                {/* Navn */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Navn</Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Navn"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                </View>

                {/* Email (read-only) */}
                <View style={styles.row}>
                  <View className="roleIcon" style={styles.roleIcon}>
                    <Ionicons name="mail-outline" size={18} color={COLORS.accent} />
                  </View>
                  <Text style={styles.rowText} numberOfLines={1}>
                    {selectedPlayer?.email ?? ""}
                  </Text>
                </View>

                {/* Holdkaptajn for */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Holdkaptajn for:</Text>

                  {editCaptainTeams.length === 0 ? (
                    <Text style={styles.helpText}>Ikke kaptajn for nogle hold.</Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {editCaptainTeams.map((t) => (
                        <View key={t.id} style={styles.teamChip}>
                          <Text style={styles.teamChipText}>{t.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Spiller på hold */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Spiller på hold:</Text>

                  {editPlayerTeams.length === 0 ? (
                    <Text style={styles.helpText}>Ikke tilknyttet nogen hold.</Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {editPlayerTeams.map((t) => (
                        <View key={t.id} style={styles.teamChip}>
                          <Text style={styles.teamChipText}>{t.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Giv admin-knap – kun hvis ikke admin i forvejen */}
                {!editIsAdmin && (
                  <Pressable
                    onPress={grantAdminToPlayer}
                    style={[styles.primaryButton, { marginTop: 4 }]}
                  >
                    <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.bg} />
                    <Text style={styles.primaryButtonText}>Giv admin</Text>
                  </Pressable>
                )}
              </View>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={savePlayerEdits}
                disabled={savingEdit}
                style={[styles.primaryButton, savingEdit && { opacity: 0.7 }]}
              >
                <Ionicons name="save-outline" size={18} color={COLORS.bg} />
                <Text style={styles.primaryButtonText}>
                  {savingEdit ? "Gemmer..." : "Gem ændringer"}
                </Text>
              </Pressable>

              <Pressable
                onPress={deletePlayer}
                disabled={deleting}
                style={[styles.dangerButton, deleting && { opacity: 0.7 }]}
              >
                <Ionicons name="trash-outline" size={18} color={COLORS.text} />
                <Text style={styles.dangerButtonText}>
                  {deleting ? "Sletter..." : "Slet spiller"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setMode("players")}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Tilbage</Text>
              </Pressable>
            </>
          )}
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const COLORS = {
  bg: "#0B0F14",
  panel: "#0F1620",
  overlay: "rgba(0,0,0,0.32)",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  overlayPress: { flex: 1 },

  panel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: COLORS.panel,
    paddingHorizontal: 16,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 18,
        shadowOffset: { width: -8, height: 0 },
      },
      android: { elevation: 12 },
    }),
  },

  panelInner: { flex: 1, paddingTop: 6, paddingBottom: 16 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  title: { color: COLORS.text, fontSize: 20, fontWeight: "700", flexShrink: 1 },
  subtitle: { marginTop: 4, color: COLORS.textSoft, fontSize: 13 },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 14,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rowText: { color: COLORS.text, fontSize: 14, flex: 1 },

  roleIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  adminButton: {
    marginTop: 6,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 12,
    borderRadius: 14,
  },
  adminButtonText: { color: COLORS.text, fontSize: 14, fontWeight: "700" },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },

  inputWrap: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  inputLabel: { color: COLORS.textSoft, fontSize: 12 },
  input: { color: COLORS.text, fontSize: 14, paddingVertical: 8 },

  rolePicker: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  roleChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  roleChipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.35)",
  },
  roleChipText: { color: COLORS.textSoft, fontSize: 13, fontWeight: "600" },
  roleChipTextActive: { color: COLORS.text },

  primaryButton: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: { color: COLORS.bg, fontSize: 15, fontWeight: "700" },

  secondaryButton: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryButtonText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },

  overlayTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.12)" },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "nowrap",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  roleBadgeText: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "lowercase",
  },
  sectionTitlePlayers: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 10,
  },
  helpText: {
    color: COLORS.textSoft,
    fontSize: 13,
  },
  playerRow: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  playerName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  dangerButton: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255, 82, 82, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.35)",
  },
  dangerButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  teamChip: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  teamChipActive: {
    backgroundColor: "rgba(245,197,66,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.40)",
  },
  teamChipText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  teamChipSub: {
    color: COLORS.textSoft,
    fontSize: 11,
  },
  badgeRowSmall: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
  removePlayerButton: {
    paddingLeft: 8,
    paddingVertical: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modeChipActive: {
    backgroundColor: "rgba(245,197,66,0.18)",
    borderWidth: 1,
    borderColor: "rgba(245,197,66,0.6)",
  },
  modeChipText: {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: "600",
  },
  modeChipTextActive: {
    color: COLORS.text,
  },
});

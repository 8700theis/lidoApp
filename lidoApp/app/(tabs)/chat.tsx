// app/(tabs)/chat.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
  useWindowDimensions,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";

type UserTeam = {
  id: string;
  name: string;
};

type ChatMessage = {
  id: string;
  team_id: string;
  sender_email: string;
  message: string;
  created_at: string;
};

type MemberMeta = {
  email: string;
  name: string | null;
  is_admin: boolean;
  is_captain: boolean;
  is_player: boolean;
};

const COLORS = {
  bg: "#0B0F14",
  bgCard: "#151A22",
  bgCardSoft: "rgba(255,255,255,0.02)",
  accent: "#F5C542",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  borderSoft: "rgba(255,255,255,0.12)",
};

export default function ChatScreen() {
  const { session } = useSession();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  const email = session?.user?.email?.toLowerCase() ?? null;

  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teams, setTeams] = useState<UserTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");

  const [teamUnread, setTeamUnread] = useState<Record<string, number>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [members, setMembers] = useState<Record<string, MemberMeta>>({});
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const scrollRef = useRef<ScrollView | null>(null);
  const channelsRef = useRef<Record<string, any>>({});

  const isWide = width >= 720;

  // badge på tab-ikonet
  useEffect(() => {
    (navigation as any).setOptions({
      tabBarBadge:
        totalUnread > 0 ? (totalUnread > 9 ? "9+" : totalUnread) : undefined,
    });
  }, [navigation, totalUnread]);

  // små rolle-badges (samme stil som i profilen, bare mindre)
  const renderBadgesSmall = (meta: MemberMeta | undefined) => {
    if (!meta) return null;
    const { is_admin, is_captain, is_player } = meta;

    if (!is_admin && !is_captain && !is_player) return null;

    return (
      <View style={styles.badgeRowSmall}>
        {is_admin && (
          <Ionicons
            name="shield-checkmark-outline"
            size={13}
            color={COLORS.accent}
          />
        )}
        {is_captain && (
          <Ionicons name="flag-outline" size={13} color="#4DA3FF" />
        )}
        {is_player && (
          <Ionicons name="navigate-outline" size={13} color="#3EE08E" />
        )}
      </View>
    );
  };

  // ---------- LOAD TEAMS FOR USER ----------

  useEffect(() => {
    const loadTeams = async () => {
      if (!email) {
        setTeams([]);
        setLoadingTeams(false);
        return;
      }

      setLoadingTeams(true);
      try {
        const [{ data: captainTeams, error: capErr }, { data: playerLinks, error: plErr }] =
          await Promise.all([
            supabase.from("teams").select("id,name").eq("captain_email", email),
            supabase.from("team_players").select("team_id").eq("email", email),
          ]);

        if (capErr || plErr) {
          console.error(capErr || plErr);
          setTeams([]);
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
          return;
        }

        const { data: teamRows, error: teamErr } = await supabase
          .from("teams")
          .select("id,name")
          .in("id", allTeamIds);

        if (teamErr) {
          console.error(teamErr);
          setTeams([]);
          return;
        }

        const uniqTeams: UserTeam[] = Array.from(
          new Map(
            (teamRows ?? []).map((t) => [
              t.id as string,
              { id: t.id as string, name: t.name as string },
            ])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));

        setTeams(uniqTeams);
        if (!selectedTeamId && uniqTeams.length > 0) {
          setSelectedTeamId(uniqTeams[0].id);
        }
      } finally {
        setLoadingTeams(false);
      }
    };

    loadTeams();
  }, [email]);

  // ---------- LOAD MEMBERS FOR SELECTED TEAM ----------

  useEffect(() => {
    const loadMembers = async () => {
      if (!selectedTeamId) {
        setMembers({});
        return;
      }

      try {
        const [{ data: teamRow, error: teamErr }, { data: playerLinks, error: plErr }] =
          await Promise.all([
            supabase
              .from("teams")
              .select("id,name,captain_email")
              .eq("id", selectedTeamId)
              .single(),
            supabase
              .from("team_players")
              .select("email")
              .eq("team_id", selectedTeamId),
          ]);

        if (teamErr || plErr || !teamRow) {
          console.log("loadMembers error", teamErr || plErr);
          setMembers({});
          return;
        }

        const captainEmail = (teamRow.captain_email || "").toLowerCase();
        const playerEmails = (playerLinks ?? []).map((p: any) =>
          (p.email || "").toLowerCase()
        );

        const allEmails = Array.from(
          new Set<string>([captainEmail, ...playerEmails].filter(Boolean))
        );

        if (allEmails.length === 0) {
          setMembers({});
          return;
        }

        const { data: users, error: usersErr } = await supabase
          .from("allowed_users")
          .select("email,name,role,is_admin")
          .in("email", allEmails);

        if (usersErr) {
          console.log("loadMembers users error", usersErr.message);
          setMembers({});
          return;
        }

        const metaMap: Record<string, MemberMeta> = {};

        for (const u of users ?? []) {
          const mail = (u.email || "").toLowerCase();
          metaMap[mail] = {
            email: mail,
            name: u.name ?? null,
            is_admin: !!u.is_admin,
            is_captain: mail === captainEmail,
            is_player: playerEmails.includes(mail),
          };
        }

        setMembers(metaMap);
      } catch (e) {
        console.log("loadMembers unexpected", e);
        setMembers({});
      }
    };

    loadMembers();
  }, [selectedTeamId]);

  // ---------- LOAD MESSAGES FOR SELECTED TEAM ----------

  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedTeamId) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      try {
        const { data, error } = await supabase
          .from("team_messages")
          .select("id,team_id,sender_email,message,created_at")
          .eq("team_id", selectedTeamId)
          .order("created_at", { ascending: true })
          .limit(200);

        if (error) {
          console.log("loadMessages error", error.message);
          setMessages([]);
          return;
        }

        setMessages((data ?? []) as ChatMessage[]);
        setTeamUnread((prev) => ({ ...prev, [selectedTeamId]: 0 }));
      } finally {
        setLoadingMessages(false);
      }
    };

    loadMessages();
  }, [selectedTeamId]);

  // ---------- REALTIME ----------

  useEffect(() => {
    // ryd tidligere kanaler
    Object.values(channelsRef.current).forEach((ch) => {
      supabase.removeChannel(ch);
    });
    channelsRef.current = {};

    if (!teams.length) return;

    const map: Record<string, any> = {};

    teams.forEach((team) => {
      const channel = supabase
        .channel(`team-messages-${team.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "team_messages",
            filter: `team_id=eq.${team.id}`,
          },
          (payload) => {
            const msg = payload.new as ChatMessage;

            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;

              if (msg.team_id === selectedTeamId) {
                return [...prev, msg];
              }
              return prev;
            });

            if (msg.team_id !== selectedTeamId) {
              setTeamUnread((prev) => ({
                ...prev,
                [msg.team_id]: (prev[msg.team_id] ?? 0) + 1,
              }));
            }
          }
        )
        .subscribe();

      map[team.id] = channel;
    });

    channelsRef.current = map;

    return () => {
      Object.values(channelsRef.current).forEach((ch) => {
        supabase.removeChannel(ch);
      });
      channelsRef.current = {};
    };
  }, [teams, selectedTeamId]);

  useEffect(() => {
  const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
    setKeyboardOffset(e.endCoordinates.height);
  });
  const hideSub = Keyboard.addListener("keyboardDidHide", () => {
    setKeyboardOffset(0);
  });

  return () => {
    showSub.remove();
    hideSub.remove();
  };
}, []);

  // ---------- TOTAL UNREAD ----------

  useEffect(() => {
    const total = Object.values(teamUnread).reduce(
      (sum, n) => sum + (n || 0),
      0
    );
    setTotalUnread(total);
  }, [teamUnread]);

  // ---------- SEND MESSAGE ----------

  const handleSend = async () => {
    if (!selectedTeamId || !email) return;
    const text = input.trim();
    if (!text) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from("team_messages")
        .insert({
          team_id: selectedTeamId,
          sender_email: email,
          message: text,
        })
        .select()
        .single();

      if (error) {
        console.log("handleSend error:", error.message);
      } else if (data) {
        setMessages((prev) => [...prev, data as ChatMessage]);
        setInput("");
      }
    } finally {
      setSending(false);
    }
  };

  // ---------- HELPERS ----------

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const formatStamp = (iso: string) => {
    const d = new Date(iso);
    const dateStr = d
      .toLocaleDateString("da-DK", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Copenhagen",
      })
      .replace(/\./g, "-");
    const timeStr = d
      .toLocaleTimeString("da-DK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Copenhagen",
      })
      .replace(".", ":");
    return `${dateStr}, ${timeStr}`;
  };

  const getDisplayName = (mail: string) => {
    const meta = members[mail.toLowerCase()];
    if (meta?.name) return meta.name;
    return mail.split("@")[0];
  };

  // ---------- RENDER ----------

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={[styles.inner, styles.centered]}>
          <Text style={styles.infoText}>
            Du skal være logget ind for at bruge chatten.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

    return (
        <SafeAreaView style={styles.root}>
            <View style={styles.inner}>
            <View
                style={[
                styles.container,
                { flexDirection: isWide ? "row" : "column" },
                ]}
            >
          {/* Sidebar - holdliste */}
          <View
            style={[
              styles.sidebar,
              { width: isWide ? 160 : "100%", marginBottom: isWide ? 0 : 12 },
            ]}
          >
            <Text style={styles.sectionTitle}>Hold</Text>

            {loadingTeams ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" />
              </View>
            ) : teams.length === 0 ? (
              <Text style={styles.infoText}>
                Du er endnu ikke tilknyttet nogen hold.
              </Text>
            ) : (
              teams.map((team) => {
                const unread = teamUnread[team.id] ?? 0;
                const isSelected = team.id === selectedTeamId;
                return (
                  <Pressable
                    key={team.id}
                    onPress={() => setSelectedTeamId(team.id)}
                    style={[
                      styles.teamRow,
                      isSelected && styles.teamRowSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.teamName,
                        isSelected && styles.teamNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {team.name}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.unreadBadgeSmall}>
                        <Text style={styles.unreadBadgeSmallText}>
                          {unread > 9 ? "9+" : unread}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>

          {/* Chat panel */}
          <View style={styles.chatPanel}>
            {!selectedTeam ? (
              <View style={styles.centered}>
                <Text style={styles.infoText}>
                  Vælg et hold i venstre side for at starte chat.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.chatHeader}>
                  <Text style={styles.chatTitle}>{selectedTeam.name}</Text>
                  <Text style={styles.chatSubtitle}>
                    Intern holdchat – kun for medlemmer.
                  </Text>
                </View>

                <View
                style={[
                    styles.messagesContainer,
                    { paddingBottom: 56 + keyboardOffset },   // ⬅️ base + keyboard-højde
                ]}
                >
                  {loadingMessages ? (
                    <View style={styles.centered}>
                      <ActivityIndicator size="small" />
                    </View>
                  ) : messages.length === 0 ? (
                    <View style={styles.centered}>
                      <Text style={styles.infoText}>
                        Ingen beskeder endnu. Skriv den første 👋
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                    ref={scrollRef}
                    style={styles.messagesScroll}
                    contentContainerStyle={{ paddingBottom: 8 }}
                    onContentSizeChange={() =>
                        scrollRef.current?.scrollToEnd({ animated: true })
                    }
                    >
                      {messages.map((msg) => {
                        const mail = msg.sender_email.toLowerCase();
                        const meta = members[mail];
                        const mine = mail === email;
                        const stamp = formatStamp(msg.created_at);

                        return (
                          <View
                            key={msg.id}
                            style={[
                              styles.messageBubble,
                              mine && styles.messageBubbleMine,
                            ]}
                          >
                            <View style={styles.messageHeader}>
                              <View style={styles.messageHeaderLeft}>
                                <Text
                                  style={[
                                    styles.messageAuthor,
                                    mine && styles.messageAuthorMine,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {getDisplayName(mail)}
                                </Text>
                                {renderBadgesSmall(meta)}
                              </View>
                            </View>

                            <Text style={styles.messageText}>{msg.message}</Text>

                            <Text style={styles.messageTimestamp}>{stamp}</Text>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    placeholder="Skriv en besked til holdet..."
                    placeholderTextColor={COLORS.textSoft}
                    value={input}
                    onChangeText={setInput}
                    multiline
                />
                <Pressable
                    onPress={handleSend}
                    disabled={sending || !input.trim()}
                    style={[
                    styles.sendButton,
                    (sending || !input.trim()) && styles.sendButtonDisabled,
                    ]}
                >
                    <Ionicons
                    name="send"
                    size={18}
                    color={sending || !input.trim() ? COLORS.textSoft : COLORS.bg}
                    />
                </Pressable>
                </View>
              </>
            )}
          </View>
      </View>
    </View>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  container: {
    flex: 1,
  },
  sidebar: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 18,
    padding: 10,
  },
    chatPanel: {
    flex: 1,
    marginLeft: 0,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: COLORS.bgCard,
    padding: 10,
    position: "relative",        // ⬅️ vigtigt
    },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: COLORS.bgCardSoft,
    marginBottom: 6,
  },
  teamRowSelected: {
    backgroundColor: "rgba(245,197,66,0.15)",
  },
  teamName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "500",
  },
  teamNameSelected: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  unreadBadgeSmall: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
  },
  unreadBadgeSmallText: {
    color: COLORS.bg,
    fontSize: 11,
    fontWeight: "700",
  },
  infoText: {
    color: COLORS.textSoft,
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeader: {
    marginBottom: 8,
  },
  chatTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  chatSubtitle: {
    color: COLORS.textSoft,
    fontSize: 13,
    marginTop: 2,
  },
    messagesContainer: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
    marginBottom: 0,    // vi styrer pladsen med paddingBottom
    },
  messagesScroll: {
    flex: 1,
  },
  messageBubble: {
    maxWidth: "80%",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignSelf: "flex-start",
  },
  messageBubbleMine: {
    backgroundColor: "rgba(245,197,66,0.22)",
    alignSelf: "flex-end",
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  messageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  messageAuthor: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    marginRight: 4,
  },
  messageAuthorMine: {
    color: COLORS.text,
  },
  badgeRowSmall: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
  },
  messageText: {
    color: COLORS.text,
    fontSize: 14,
  },
  messageTimestamp: {
    color: COLORS.textSoft,
    fontSize: 11,
    alignSelf: "flex-end",
    marginTop: 4,
  },
    inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,   // fast afstand til bunden af chatPanel
    },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    color: COLORS.text,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(245,197,66,0.35)",
  },
});
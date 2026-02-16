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
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";
import { Ionicons } from "@expo/vector-icons";

type ProfileRow = { role: string; is_admin: boolean; name: string | null };

const ROLES = ["admin", "kaptajn", "spiller"] as const;
type Role = (typeof ROLES)[number];

export default function ProfileModal() {
  const { session } = useSession();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // UI state: main / create
  const [mode, setMode] = useState<"main" | "create">("main");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("spiller");
  const [creating, setCreating] = useState(false);

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

    run();
  }, [session?.user?.id]);

  const close = () => {
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

  const logout = async () => {
    await supabase.auth.signOut();
    close();
  };

  const effectiveRole: Role = (profile?.is_admin ? "admin" : (profile?.role as Role) || "spiller") ?? "spiller";

  const roleIcon = useMemo(() => {
    if (effectiveRole === "admin") return { name: "shield-checkmark-outline" as const, color: COLORS.accent };
    if (effectiveRole === "kaptajn") return { name: "flag-outline" as const, color: "#7FB2FF" };
    // “dart” vibe: en pil/arrow (Ionicons har ikke dart)
    return { name: "navigate-outline" as const, color: "#3EE08E" };
  }, [effectiveRole]);

  const resetCreateForm = () => {
    setNewName("");
    setNewEmail("");
    setNewRole("spiller");
  };

  const createAllowedUser = async () => {
    const email = newEmail.trim().toLowerCase();
    const name = newName.trim();

    if (!name || !email) {
      Alert.alert("Mangler", "Udfyld navn og email.");
      return;
    }

    setCreating(true);
    const { error } = await supabase.rpc("admin_upsert_allowed_user", {
      p_email: email,
      p_name: name,
      p_role: newRole,
    });
    setCreating(false);

    if (error) {
      Alert.alert("Fejl", error.message);
      return;
    }

    Alert.alert("Oprettet ✅", `${name} (${newRole}) er nu whitelisted.`);
    resetCreateForm();
    setMode("main");
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
          <View style={styles.headerRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {profile?.name ?? "Profil"}
                </Text>

                {!profileLoading && (
                  <View style={styles.roleBadge}>
                    <Ionicons
                      name={roleIcon.name as any}
                      size={14}
                      color={roleIcon.color}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.roleBadgeText}>{effectiveRole}</Text>
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

                {/* Rolle (uden "Rolle:" label) 
                <View style={[styles.row, styles.roleRow]}>
                  <View style={styles.roleIcon}>
                    <Ionicons name={roleIcon.name as any} size={18} color={roleIcon.color} />
                  </View>
                  <Text style={[styles.rowText, styles.roleText]}>
                    {profileLoading ? "henter..." : effectiveRole}
                  </Text>
                </View>*/}

                {/* Admin-only */}
                {!profileLoading && profile?.is_admin ? (
                  <Pressable onPress={() => setMode("create")} style={styles.adminButton}>
                    <Ionicons name="person-add-outline" size={18} color={COLORS.text} />
                    <Text style={styles.adminButtonText}>Opret spiller</Text>
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
          ) : (
            <>
              {/* Create view */}
              <View style={{ gap: 10 }}>
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

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Rolle</Text>

                  {/* Simple dropdown-style */}
                  <View style={styles.rolePicker}>
                    {ROLES.map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setNewRole(r)}
                        style={[
                          styles.roleChip,
                          newRole === r && styles.roleChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            newRole === r && styles.roleChipTextActive,
                          ]}
                        >
                          {r}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={{ flex: 1 }} />

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
      android: {
        elevation: 12,
      },
    }),
  },

  panelInner: {
    flex: 1,
    paddingTop: 6,
    paddingBottom: 16,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  
  // Rolle row: mindre padding/luft
  roleRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  roleIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  roleText: {
    fontSize: 14,
    fontWeight: "400",
    textTransform: "lowercase",
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

  inputWrap: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  inputLabel: { color: COLORS.textSoft, fontSize: 12 },
  input: {
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 8,
  },

  rolePicker: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
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
  roleChipText: {
    color: COLORS.textSoft,
    fontSize: 13,
    fontWeight: "600",
  },
  roleChipTextActive: {
    color: COLORS.text,
  },

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

  overlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  titleRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  flexWrap: "nowrap",
},

roleBadge: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
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

});

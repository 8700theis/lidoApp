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
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";
import { Ionicons } from "@expo/vector-icons";

export default function ProfileModal() {
  const { session } = useSession();
  const [profile, setProfile] = useState<{ role: string; is_admin: boolean; name: string | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const { width: screenW, height: screenH } = useWindowDimensions();

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
    // hvis skærmbredde ændrer sig (rotation), sørg for at offscreen er korrekt
    panelX.setValue(offscreenX);
    overlayOpacity.setValue(0);
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offscreenX]);

  const logout = async () => {
    await supabase.auth.signOut();
    close();
  };

  return (
    <View style={styles.root}>
      {/* Overlay (mere transparent så tabben kan ses) */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayOpacity }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : null}

        <View
          style={[
            styles.overlayTint,
            { backgroundColor: Platform.OS === "ios"
                ? "rgba(0,0,0,0.12)"
                : "rgba(10,14,20,0.55)"
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
              <Text style={styles.title}>Profil</Text>
              <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                {session?.user?.email ?? ""}
              </Text>
            </View>

            <Pressable onPress={close} hitSlop={12} style={styles.iconButton}>
              <Ionicons name="close" size={20} color={COLORS.textSoft} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={{ gap: 10 }}>
            <View style={styles.row}>
              <Ionicons name="mail-outline" size={18} color={COLORS.textSoft} />
              <Text style={styles.rowText} numberOfLines={1} ellipsizeMode="middle">
                {session?.user?.email ?? "—"}
              </Text>
            </View>

            <View style={styles.row}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.accent} />
              <Text style={styles.rowText}>
                Rolle: {profileLoading ? "henter..." : (profile?.is_admin ? "admin" : (profile?.role ?? "player"))}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <Pressable onPress={logout} style={styles.primaryButton}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.bg} />
            <Text style={styles.primaryButtonText}>Log ud</Text>
          </Pressable>

          <Pressable onPress={close} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Luk</Text>
          </Pressable>
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
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

  headerRow: {
    flexDirection: "row",
    alignItems: "center", // ✅ vigtig: så close ikke ryger ud
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

  title: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
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
  panelInner: {
  flex: 1,
  paddingTop: 6,
  paddingBottom: 16,
  },
  overlayTint: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(0,0,0,0.12)", // justér: 0.18–0.35
  },

});

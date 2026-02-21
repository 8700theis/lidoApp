import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useSession } from "../hooks/useSession";

const COLORS = {
  bg: "#0B0F14",
  panel: "#0F1620",
  overlay: "rgba(0,0,0,0.32)",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState<"none" | "login" | "signup">("none");

  const { session, loading } = useSession();

  // Hvis vi allerede er logget ind → ind i appen
  useEffect(() => {
    if (!loading && session) {
      router.replace("/(tabs)");
    }
  }, [loading, session]);

  const checkWhitelist = async (rawEmail: string) => {
    const normalized = rawEmail.trim().toLowerCase();

    const { data: allowed, error } = await supabase.rpc("is_email_allowed", {
      p_email: normalized,
    });

    if (error) {
      Alert.alert("Fejl", error.message);
      return false;
    }

    if (!allowed) {
      Alert.alert(
        "Ingen adgang",
        "Din email er ikke godkendt endnu. Kontakt din træner/klub for adgang."
      );
      return false;
    }

    return true;
  };

  const signUp = async () => {
    if (submitting !== "none") return;

    if (!email || !password) {
      Alert.alert("Mangler", "Udfyld både email og password.");
      return;
    }

    if (password.length < 8) {
      Alert.alert("For kort password", "Password skal mindst være 8 tegn.");
      return;
    }

    const normalized = email.trim().toLowerCase();

    setSubmitting("signup");
    try {
      const ok = await checkWhitelist(normalized);
      if (!ok) return;

      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
      });

      if (error) {
        Alert.alert("Fejl", error.message);
        return;
      }

      if (data.session) {
        Alert.alert("Konto oprettet", "Du er nu logget ind ✅");
        router.replace("/(tabs)");
        return;
      }

      Alert.alert("Konto oprettet", "Tjek din email og log ind ✅");
    } finally {
      setSubmitting("none");
    }
  };

  const signIn = async () => {
    if (submitting !== "none") return;

    if (!email || !password) {
      Alert.alert("Mangler", "Udfyld både email og password.");
      return;
    }

    const normalized = email.trim().toLowerCase();

    setSubmitting("login");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });

      if (error) {
        Alert.alert("Fejl", error.message);
        return;
      }
      // Redirect sker i useEffect, når session er sat
    } finally {
      setSubmitting("none");
    }
  };

  const isLoggingIn = submitting === "login";
  const isSigningUp = submitting === "signup";

   return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.inner}>
          {/* TOP: Titel i øverste halvdel */}
          <View style={styles.topSection}>
            <Text style={styles.appTitle}>Velkommen til Lido!</Text>
            <Text style={styles.appSubtitle}>Log ind for at se hold og kampprogrammer</Text>
          </View>

          {/* MIDT: Card + lille hjælpetekst lige under */}
          <View style={styles.centerSection}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Log ind</Text>

              <View style={{ gap: 10 }}>
                {/* Email */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="mail@domæne.dk"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.input}
                  />
                </View>

                {/* Password */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Min. 8 tegn"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>

                <Text style={styles.helpText}>
                  Din email skal være godkendt af klubben, før du kan oprette en bruger.
                </Text>
              </View>

              {/* Knapper */}
              <View style={{ marginTop: 18, gap: 10 }}>
                <Pressable
                  onPress={signIn}
                  disabled={submitting !== "none"}
                  style={[
                    styles.primaryButton,
                    submitting !== "none" && { opacity: 0.8 },
                  ]}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator size="small" color={COLORS.bg} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Log ind</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={signUp}
                  disabled={submitting !== "none"}
                  style={[
                    styles.secondaryButton,
                    submitting !== "none" && { opacity: 0.8 },
                  ]}
                >
                  {isSigningUp ? (
                    <ActivityIndicator size="small" color={COLORS.text} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Opret bruger</Text>
                  )}
                </Pressable>
              </View>
            </View>

            {/* Hjælpetekst lige under kortet */}
            <Text style={styles.footerText}>
              Har du problemer med login, så tag fat i din træner eller admin.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
  },
  appTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "800",
  },
  appSubtitle: {
    color: COLORS.textSoft,
    fontSize: 14,
    marginTop: 4,
  },

  // Øverste halvdel
  topSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 40,
  },

  // Nederste halvdel: card centreret + tekst under
  centerSection: {
    marginBottom: 100,
    flex: 1,
    justifyContent: "center",
    alignItems: "stretch",
  },

  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  inputWrap: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  inputLabel: {
    color: COLORS.textSoft,
    fontSize: 12,
  },
  input: {
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 6,
  },
  helpText: {
    marginTop: 4,
    color: COLORS.textSoft,
    fontSize: 12,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    color: COLORS.bg,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },

  footerText: {
    marginTop: 16,
    color: COLORS.textSoft,
    fontSize: 12,
    textAlign: "center",
  },
});
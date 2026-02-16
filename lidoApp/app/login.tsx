import { router } from "expo-router";
import { useSession } from "../hooks/useSession";
import { useEffect, useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { session, loading } = useSession();

  // Én stabil redirect: hvis logged in -> tabs
  useEffect(() => {
    if (!loading && session) {
      router.replace("/(tabs)");
    }
  }, [loading, session]);

  const checkWhitelist = async () => {
    const { data: allowed, error } = await supabase.rpc("is_email_allowed", {
      p_email: email,
    });

    if (error) {
      Alert.alert("Fejl", error.message);
      return false;
    }

    if (!allowed) {
      Alert.alert("Ingen adgang", "Din email er ikke godkendt endnu.");
      return false;
    }

    return true;
  };

  const signUp = async () => {
    if (submitting) return;
    if (!email || !password) return Alert.alert("Mangler", "Email og password.");

    setSubmitting(true);
    try {
      const ok = await checkWhitelist();
      if (!ok) return;

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return Alert.alert("Fejl", error.message);

      if (data.session) {
        Alert.alert("Konto oprettet", "Du er nu logget ind ✅");
        router.replace("/(tabs)");
        return;
      }

      Alert.alert("Konto oprettet", "Du kan nu logge ind ✅");
    } finally {
      setSubmitting(false);
    }
  };

  const signIn = async () => {
    if (submitting) return;
    if (!email || !password) return Alert.alert("Mangler", "Email og password.");

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert("Fejl", error.message);
      // navigation sker via useEffect når session kommer
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />

      <TextInput
        placeholder="Password (min. 8 tegn)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />

      <Button title={submitting ? "..." : "Log ind"} onPress={signIn} disabled={submitting} />
      <Button title={submitting ? "..." : "Opret bruger"} onPress={signUp} disabled={submitting} />
    </View>
  );
}

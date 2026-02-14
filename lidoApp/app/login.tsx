import { Redirect } from "expo-router";
import { useSession } from "../hooks/useSession";
import { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { session, loading } = useSession();
  if (!loading && session) return <Redirect href="/(tabs)" />;

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
    if (!email || !password) return Alert.alert("Mangler", "Email og password.");

    const ok = await checkWhitelist();
    if (!ok) return;

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      Alert.alert("Fejl", error.message);
    } else {
      Alert.alert("Konto oprettet", "Du kan nu logge ind ✅");
    }
  };

  const signIn = async () => {
    if (!email || !password) return Alert.alert("Mangler", "Email og password.");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      Alert.alert("Fejl", error.message);
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

      <Button title="Log ind" onPress={signIn} />
      <Button title="Opret bruger" onPress={signUp} />
    </View>
  );
}

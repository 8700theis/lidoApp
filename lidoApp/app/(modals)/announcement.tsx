import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../hooks/useSession";
import { CURRENT_ANNOUNCEMENT } from "../../constants/announcement";

const COLORS = {
  bg: "#0B0F14",
  card: "#151A22",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

export default function AnnouncementModal() {
  const { session } = useSession();

  const handleContinue = async () => {
    if (session?.user?.id) {
      const { error } = await supabase
        .from("profiles")
        .update({
          last_seen_announcement: CURRENT_ANNOUNCEMENT.id,
        })
        .eq("id", session.user.id);

      if (error) {
        console.log("announcement update error:", error.message);
      }
    }

    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="rocket-outline" size={38} color={COLORS.bg} />
        </View>

        <Text style={styles.title}>{CURRENT_ANNOUNCEMENT.title}</Text>
        <Text style={styles.subtitle}>{CURRENT_ANNOUNCEMENT.subtitle}</Text>

        <View style={styles.card}>
          {CURRENT_ANNOUNCEMENT.sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={handleContinue} style={styles.button}>
          <Text style={styles.buttonText}>Kom i gang</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 22,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: COLORS.textSoft,
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    gap: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: "800",
  },
  sectionBody: {
    color: COLORS.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 24,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
  },
  buttonText: {
    color: COLORS.bg,
    fontSize: 16,
    fontWeight: "900",
  },
});
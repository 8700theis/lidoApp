import React from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  View,
  StyleProp,
  ViewStyle,
} from "react-native";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function KeyboardDismissView({ children, style }: Props) {
  // Kun aktiv på iOS
  if (Platform.OS !== "ios") {
    return <View style={style}>{children}</View>;
  }

  return (
    <Pressable
      style={[{ flex: 1 }, style]}
      onPress={Keyboard.dismiss}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}
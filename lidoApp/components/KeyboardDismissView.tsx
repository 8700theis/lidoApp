import React from "react";
import {
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[{ flex: 1 }, style]}>
        {children}
      </View>
    </TouchableWithoutFeedback>
  );
}
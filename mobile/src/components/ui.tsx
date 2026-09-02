import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";

export function Screen({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
      >
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "primary" | "warning" | "danger" | "success" }) {
  return <View style={[styles.card, cardTone[tone]]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function PrimaryButton({ title, ...props }: Omit<PressableProps, "children"> & { title: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        styles.primaryButton,
        pressed && styles.primaryPressed,
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={styles.primaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, ...props }: Omit<PressableProps, "children"> & { title: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        styles.secondaryButton,
        pressed && styles.secondaryPressed,
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function LoadingState({ label = "Loading First Move…" }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Body muted>{label}</Body>
    </View>
  );
}

const cardTone = StyleSheet.create({
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  primary: { backgroundColor: colors.primarySoft, borderColor: "#C4B5FD" },
  warning: { backgroundColor: colors.warningSoft, borderColor: "#FCD34D" },
  danger: { backgroundColor: colors.dangerSoft, borderColor: "#FDA4AF" },
  success: { backgroundColor: colors.successSoft, borderColor: "#86EFAC" },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.label,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: spacing.xs,
  },
  description: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 24,
    marginTop: spacing.sm,
    maxWidth: 680,
  },
  content: { gap: spacing.md, marginTop: spacing.lg },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: "800",
    lineHeight: 28,
  },
  body: { color: colors.text, fontSize: typography.body, lineHeight: 24 },
  muted: { color: colors.textMuted },
  label: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  button: {
    alignItems: "center",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primaryButton: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  primaryButtonText: { color: "#FFFFFF", fontSize: typography.body, fontWeight: "800" },
  secondaryButton: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  secondaryPressed: { backgroundColor: colors.surfaceMuted },
  secondaryButtonText: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  loading: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center", minHeight: 300 },
});

export const sharedStyles = styles;

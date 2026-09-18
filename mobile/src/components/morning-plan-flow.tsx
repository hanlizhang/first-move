import { File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { featureRemaining } from "../ai/access.ts";
import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import {
  completeMorningCheck,
  morningStep,
} from "../domain/morning.ts";
import { localWorkspaceKey } from "../local/repository.ts";
import { loadMorningSkip, markMorningSkipped } from "../local/morning-skip.ts";
import { colors, radii, spacing, typography } from "../theme/tokens.ts";
import { Body, Card, Heading, Label, PrimaryButton, SecondaryButton } from "./ui.tsx";
import { DayPlanner } from "./day-planner.tsx";

type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  captureMethod: "camera" | "upload";
};

export function MorningPlanFlow({ dateKey }: { dateKey: string }) {
  const { auth, localWorkspace } = useFirstMoveApp();
  const ownerKey =
    auth.status === "authenticated"
      ? localWorkspaceKey({ kind: "account", userId: auth.user.id })
      : auth.status === "guest"
        ? localWorkspaceKey({ kind: "guest" })
        : undefined;
  const [skipSnapshot, setSkipSnapshot] = useState<{
    ownerKey: string;
    dateKey?: string;
  }>();
  const complete = localWorkspace.morningChecks.some((check) => check.dateKey === dateKey);
  const skipped =
    skipSnapshot?.ownerKey === ownerKey && skipSnapshot?.dateKey === dateKey;
  const step = morningStep({ complete, skipped });

  useEffect(() => {
    if (!ownerKey) return;
    let active = true;
    void loadMorningSkip(ownerKey).then((storedDate) => {
      if (active) setSkipSnapshot({ ownerKey, dateKey: storedDate });
    });
    return () => {
      active = false;
    };
  }, [ownerKey]);

  return (
    <View style={styles.flow}>
      {step === "verify" ? (
        <MorningStart dateKey={dateKey} onSkip={skipMorning} />
      ) : (
        <Card tone={complete ? "success" : "default"}>
          <Label>Morning Start</Label>
          <Heading>{complete ? "The kitten enjoyed breakfast" : "Skipped for today"}</Heading>
          <Body muted>
            {complete
              ? "Your successful check was saved with the existing Morning reward semantics."
              : "No Morning check, reward, or AI request was created."}
          </Body>
        </Card>
      )}
      {step === "plan" ? <DayPlanner dateKey={dateKey} /> : null}
    </View>
  );

  function skipMorning() {
    if (!ownerKey) return;
    setSkipSnapshot({ ownerKey, dateKey });
    void markMorningSkipped(ownerKey, dateKey);
  }
}

function MorningStart({ dateKey, onSkip }: { dateKey: string; onSkip(): void }) {
  const {
    aiAccess,
    auth,
    updateLocalWorkspace,
    verifyToothbrush,
    workspaceEditable,
  } = useFirstMoveApp();
  const [photo, setPhoto] = useState<PreparedPhoto>();
  const [preparing, setPreparing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState("");
  const remaining = featureRemaining(aiAccess, "toothbrush_verification");
  const signedIn = auth.status === "authenticated";
  const exhausted = remaining === 0;
  const quotaCopy = useMemo(() => {
    if (!signedIn) return "Sign in is required for live AI verification.";
    if (aiAccess.status !== "ready") return undefined;
    if (aiAccess.access.accessBasis === "introductory") {
      return `${remaining} of 5 shared AI actions remaining`;
    }
    return `${remaining} of 3 toothbrush verifications remaining today`;
  }, [aiAccess, remaining, signedIn]);

  useEffect(
    () => () => {
      if (photo) deleteTransientFile(photo.uri);
    },
    [photo],
  );

  return (
    <Card tone="default">
      <Label>Morning Start · Optional daily check</Label>
      <Heading>Take a current photo with your toothbrush</Heading>
      <Body muted>
        First Move resizes it to a maximum of 768 px, uploads it only when you tap Verify photo, and deletes the temporary copy. It is a routine check, not dental analysis.
      </Body>
      {quotaCopy ? <Body muted>{quotaCopy}</Body> : null}
      {!signedIn ? (
        <Body>Guest Mode never calls the live AI service. Continue to manual planning whenever you are ready.</Body>
      ) : null}
      {photo ? (
        <>
          <Image
            accessibilityLabel="Selected toothbrush check photo preview"
            resizeMode="contain"
            source={{ uri: photo.uri }}
            style={styles.preview}
          />
          <Body muted>{photo.width} × {photo.height}px temporary JPEG</Body>
          <PrimaryButton
            disabled={verifying || exhausted || !workspaceEditable}
            onPress={() => void verify()}
            title={verifying ? "Checking photo…" : "Verify photo"}
          />
          <SecondaryButton
            disabled={verifying}
            onPress={clearPhoto}
            title="Retake or choose another"
          />
        </>
      ) : signedIn ? (
        <>
          <PrimaryButton
            disabled={preparing || exhausted}
            onPress={() => void choosePhoto("camera")}
            title={preparing ? "Preparing photo…" : "Take photo"}
          />
          <SecondaryButton
            disabled={preparing || exhausted}
            onPress={() => void choosePhoto("upload")}
            title="Choose image"
          />
        </>
      ) : null}
      {exhausted ? (
        <Body muted>
          {aiAccess.status === "ready" && aiAccess.access.accessBasis === "pro"
              ? "Today’s Pro toothbrush allowance is used."
              : "Your introductory AI actions are used."}{" "}
          Skip remains available without a reward.
        </Body>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      ) : null}
      <SecondaryButton
        disabled={verifying || preparing}
        onPress={() => {
          clearPhoto();
          onSkip();
        }}
        title="Skip without reward · Plan my day"
      />
    </Card>
  );

  async function choosePhoto(method: PreparedPhoto["captureMethod"]) {
    if (!signedIn || preparing || verifying) return;
    let pickerCacheUri: string | undefined;
    setPreparing(true);
    setMessage(
      method === "camera"
        ? "Your device may ask for camera permission. The photo is used only for this check."
        : "Your device may ask for photo access. The selected image is used only for this check.",
    );
    try {
      const permission =
        method === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setMessage(
          method === "camera"
            ? "Camera access was not allowed. Choose an image instead or skip without a reward."
            : "Photo access was not allowed. You can take a photo instead or skip without a reward.",
        );
        return;
      }
      const result =
        method === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled || !result.assets[0]) {
        setMessage("No photo was selected. Nothing was uploaded.");
        return;
      }
      const asset = result.assets[0];
      pickerCacheUri = asset.uri;
      const prepared = await preparePhoto(asset.uri, asset.width, asset.height, method);
      deletePickerCacheFile(pickerCacheUri);
      pickerCacheUri = undefined;
      clearPhoto();
      setPhoto(prepared);
      setMessage("Photo ready. Nothing is uploaded until you tap Verify photo.");
    } catch {
      if (pickerCacheUri) deletePickerCacheFile(pickerCacheUri);
      setMessage("That photo could not be prepared. Try another photo or skip without a reward.");
    } finally {
      setPreparing(false);
    }
  }

  async function verify() {
    if (!photo || !signedIn || verifying || exhausted) return;
    setVerifying(true);
    setMessage("Checking this photo once. No automatic retry will be made.");
    const imageFile = new File(photo.uri);
    if (!imageFile.exists || imageFile.size < 1 || imageFile.size > 2 * 1024 * 1024) {
      setMessage("The prepared photo could not be uploaded. Try another photo or skip without a reward.");
      setVerifying(false);
      return;
    }
    const result = await verifyToothbrush(imageFile);
    if (result.outcome === "pass") {
      const next = await updateLocalWorkspace((state) =>
        completeMorningCheck(
          state,
          dateKey,
          photo.captureMethod,
          result.mode,
        ),
      );
      if (next?.morningChecks.some((check) => check.dateKey === dateKey)) {
        clearPhoto();
        setMessage("");
        setVerifying(false);
        return;
      }
      setMessage("The check passed, but it could not be saved yet. Retry later or skip without a reward.");
    } else {
      setMessage(result.message);
    }
    setVerifying(false);
  }

  function clearPhoto() {
    setPhoto((current) => {
      if (current) deleteTransientFile(current.uri);
      return undefined;
    });
  }
}

const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  exif: false,
  mediaTypes: ["images"],
  quality: 1,
  selectionLimit: 1,
};

async function preparePhoto(
  uri: string,
  width: number,
  height: number,
  captureMethod: PreparedPhoto["captureMethod"],
): Promise<PreparedPhoto> {
  const resize =
    Math.max(width, height) > 768
      ? width >= height
        ? { resize: { width: 768 } }
        : { resize: { height: 768 } }
      : undefined;
  const result = await manipulateAsync(
    uri,
    resize ? [resize] : [],
    { compress: 0.7, format: SaveFormat.JPEG },
  );
  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    captureMethod,
  };
}

function deleteTransientFile(uri: string) {
  if (!uri.startsWith("file://")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS may already have reclaimed a cache file. No image state is retained.
  }
}

function deletePickerCacheFile(uri: string) {
  if (!uri.startsWith(Paths.cache.uri)) return;
  deleteTransientFile(uri);
}

const styles = StyleSheet.create({
  flow: { gap: spacing.md },
  preview: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: 260,
    width: "100%",
  },
  message: { color: colors.text, fontSize: typography.small, lineHeight: 21 },
});

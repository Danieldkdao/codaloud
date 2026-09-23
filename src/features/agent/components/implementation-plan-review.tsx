import { useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { MarkdownText } from "@/components/markdown-text";
import { Button } from "@/components/ui/button";
import { ContentSheet } from "@/components/ui/content-sheet";
import { Input } from "@/components/ui/input";
import { PText } from "@/components/ui/text";
import { useKeyboardFrame } from "@/hooks/use-keyboard-frame";
import { useThemeColor } from "@/hooks/use-theme";
import { agentPlans } from "../plan-runtime";
import type { AgentPlanSchema } from "../schemas";

const PlanReview = ({
  plan,
  triggerVisible,
}: {
  plan: AgentPlanSchema;
  triggerVisible: boolean;
}) => {
  const [open, setOpen] = useState(true);
  const [details, setDetails] = useState(plan.details);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardFrame();
  const background = useThemeColor("card");
  const availableHeight = keyboard
    ? Math.min(height, keyboard.screenY)
    : height;
  const reportError = (cause: unknown) =>
    setError(
      cause instanceof Error
        ? cause.message
        : "Couldn’t save your plan. Try again.",
    );
  const perform = async (approve: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (approve) await agentPlans.approve(plan.requestKey, details);
      else await agentPlans.discard(plan.requestKey);
    } catch (cause) {
      reportError(cause);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      {triggerVisible && (
        <View className="self-center mb-2">
          <Button variant="secondary" onPress={() => setOpen(true)}>
            Review plan
          </Button>
        </View>
      )}
      <ContentSheet
        open={open}
        onOpenChange={setOpen}
        backgroundColor={background}
      >
        <View
          testID="implementation-plan-body"
          className="gap-3 px-5 pt-3 pb-6"
          style={{
            height: Math.max(
              240,
              Math.min(600, height * 0.76, availableHeight - 32),
            ),
          }}
        >
          <PText
            accessibilityRole="header"
            className="text-xl font-semibold"
            numberOfLines={2}
          >
            Review implementation
          </PText>
          <ScrollView
            testID="implementation-plan-scroll"
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <PText className="text-lg font-semibold mb-3" selectable>
              {plan.title}
            </PText>
            <MarkdownText text={plan.instruction} />
          </ScrollView>
          <View className="gap-2">
            <PText>Corrections or additional details</PText>
            <Input
              accessibilityLabel="Corrections or additional details"
              placeholder="Add details or correct anything before starting."
              value={details}
              multiline
              maxLength={800}
              autoCorrect={false}
              autoCapitalize="none"
              style={{ height: 80, minHeight: 64 }}
              disabled={busy || !!plan.submissionInstruction}
              onChangeText={(value) => {
                setDetails(value);
                void agentPlans
                  .updateDetails(plan.requestKey, value)
                  .catch(reportError);
              }}
            />
            {error && (
              <PText
                accessibilityRole="alert"
                className="text-destructive"
                selectable
              >
                {error}
              </PText>
            )}
            {plan.submissionInstruction && (
              <PText className="text-muted-foreground">
                Approved. Retrying uses the same request.
              </PText>
            )}
          </View>
          <View className="flex-row gap-3">
            <Button
              variant="ghost"
              disabled={busy || !!plan.submissionInstruction}
              onPress={() => void perform(false)}
            >
              Discard
            </Button>
            <Button
              className="flex-1"
              loading={busy}
              onPress={() => void perform(true)}
            >
              {plan.submissionInstruction ? "Retry start" : "Approve & start"}
            </Button>
          </View>
        </View>
      </ContentSheet>
    </>
  );
};

export const ImplementationPlanReview = ({
  projectId,
  triggerVisible = true,
}: {
  projectId: string;
  triggerVisible?: boolean;
}) => {
  const plans = useSyncExternalStore(
    agentPlans.subscribe,
    agentPlans.getSnapshot,
  );
  const plan = plans.find((entry) => entry.projectId === projectId);
  return plan ? (
    <PlanReview
      key={plan.requestKey}
      plan={plan}
      triggerVisible={triggerVisible}
    />
  ) : null;
};

import { useState } from "react";
import { View } from "react-native";

import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";
import { HeadingText, PText } from "@/components/ui/text";

const ProjectsScreen = () => {
  const [projectName, setProjectName] = useState("");

  return (
    <AppWrapper tabBarShown>
      <View className="w-full max-w-2xl self-center gap-8">
        <View className="gap-2">
          <HeadingText accessibilityRole="header" className="text-3xl text-foreground">
            Input playground
          </HeadingText>
          <PText className="text-muted-foreground">
            Try the different styles, sizes, keyboards, and states. These examples
            are just for previewing and don’t save anything.
          </PText>
        </View>

        <View className="gap-5">
          <HeadingText accessibilityRole="header" className="text-2xl text-foreground">
            Styles & sizes
          </HeadingText>
          {(["default", "filled", "ghost"] as const).map((variant) => (
            <View key={variant} className="gap-4 rounded-xl border border-border bg-card p-4">
              <PText className="font-semibold capitalize text-foreground">{variant}</PText>
              {(["sm", "default", "lg"] as const).map((size) => {
                const label = size === "sm" ? "Small" : size === "lg" ? "Large" : "Default size";

                return (
                  <View key={size} className="gap-2">
                    <PText className="text-muted-foreground">{label}</PText>
                    <Input
                      variant={variant}
                      size={size}
                      accessibilityLabel={`${variant}, ${label}`}
                      placeholder="Type something…"
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View className="gap-4">
          <HeadingText accessibilityRole="header" className="text-2xl text-foreground">
            Input types
          </HeadingText>
          {([
            { label: "Text", type: "text", placeholder: "Your project name" },
            { label: "Password", type: "password", defaultValue: "Preview-password-123", autoComplete: "off" },
            { label: "Email", type: "email", placeholder: "you@example.com" },
            { label: "Number", type: "number", placeholder: "42" },
            { label: "Decimal", type: "decimal", placeholder: "19.95" },
            { label: "Phone", type: "phone", placeholder: "+1 (555) 123-4567" },
            { label: "Telephone (tel)", type: "tel", placeholder: "555-123-4567" },
            { label: "URL", type: "url", placeholder: "https://example.com" },
            { label: "Search", type: "search", placeholder: "Search projects…" },
            { label: "Username", type: "username", placeholder: "your_username" },
            { label: "One-time code", type: "otp", placeholder: "123456", maxLength: 6 },
          ] satisfies (InputProps & { label: string })[]).map(({ label, ...props }) => (
            <View key={label} className="gap-2">
              <PText className="text-foreground">{label}</PText>
              <Input {...props} accessibilityLabel={label} />
            </View>
          ))}
        </View>

        <View className="gap-4">
          <HeadingText accessibilityRole="header" className="text-2xl text-foreground">
            States
          </HeadingText>
          <View className="gap-2">
            <PText className="text-foreground">Invalid</PText>
            <Input invalid accessibilityLabel="Invalid email example" defaultValue="not-an-email" />
            <PText selectable className="text-destructive">Enter a valid email address.</PText>
          </View>
          <View className="gap-2">
            <PText className="text-foreground">Disabled</PText>
            <Input disabled accessibilityLabel="Disabled example" defaultValue="This input is disabled" />
          </View>
          <View className="gap-2">
            <PText className="text-foreground">Read only</PText>
            <Input readOnly accessibilityLabel="Read only example" defaultValue="This value cannot be edited" />
          </View>
          <View className="gap-2">
            <PText className="text-foreground">Password without a toggle</PText>
            <Input
              type="password"
              showPasswordToggle={false}
              autoComplete="off"
              accessibilityLabel="Password without a toggle"
              defaultValue="Preview-password-123"
            />
          </View>
        </View>

        <View className="gap-4">
          <HeadingText accessibilityRole="header" className="text-2xl text-foreground">
            More ways to use it
          </HeadingText>
          <View className="gap-2">
            <PText className="text-foreground">Multiline</PText>
            <Input multiline accessibilityLabel="Project notes" placeholder="Write a few lines about your project…" />
          </View>
          <View className="gap-2">
            <PText className="text-foreground">Custom styling</PText>
            <Input
              accessibilityLabel="Custom rounded input"
              placeholder="Rounded with a monospace font"
              className="rounded-full border-2 border-primary bg-secondary px-5 font-mono"
            />
          </View>
          <View className="gap-2">
            <PText className="text-foreground">Live value</PText>
            <Input
              accessibilityLabel="Live project name"
              placeholder="Name your project"
              value={projectName}
              onChangeText={setProjectName}
              maxLength={40}
            />
            <PText selectable className="text-muted-foreground">
              {projectName.length}/40 characters · {projectName || "Nothing typed yet"}
            </PText>
            <Button variant="outline" className="self-start" disabled={!projectName} onPress={() => setProjectName("")}>
              Clear
            </Button>
          </View>
        </View>
      </View>
    </AppWrapper>
  );
};

export default ProjectsScreen;

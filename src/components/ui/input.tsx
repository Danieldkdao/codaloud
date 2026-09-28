import { cva } from "class-variance-authority";
import {
  ComponentPropsWithRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { TextInput, TextInputProps, View, ViewProps } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useKeyboardSymbols } from "@/hooks/use-keyboard-symbols";

export type InputType =
  | "text"
  | "password"
  | "email"
  | "number"
  | "decimal"
  | "tel"
  | "phone"
  | "url"
  | "search"
  | "username"
  | "otp";

export type InputProps = ComponentPropsWithRef<typeof TextInput> & {
  /** Keyboard/autofill defaults; native props can override these presets. */
  type?: InputType;
  variant?: "default" | "filled" | "ghost";
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
  invalid?: boolean;
  "aria-invalid"?: boolean;
  /** Styles the outer layout wrapper. className and style target TextInput. */
  containerClassName?: string;
  containerStyle?: ViewProps["style"];
  showPasswordToggle?: boolean;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
  /**
   * Whether this field offers the special-character strip above the keyboard.
   * The host is app-wide, so a password or one-time code field must opt out.
   */
  keyboardSymbols?: boolean;
};

export const INPUT_TYPE_DEFAULTS: Record<InputType, TextInputProps> = {
  text: {},
  password: {
    autoCapitalize: "none",
    autoCorrect: false,
    spellCheck: false,
    autoComplete: "current-password",
  },
  email: {
    inputMode: "email",
    autoCapitalize: "none",
    autoCorrect: false,
    autoComplete: "email",
  },
  number: {
    inputMode: "numeric",
  },
  decimal: {
    inputMode: "decimal",
  },
  tel: {
    inputMode: "tel",
    autoComplete: "tel",
  },
  phone: {
    inputMode: "tel",
    autoComplete: "tel",
  },
  url: {
    inputMode: "url",
    autoCapitalize: "none",
    autoCorrect: false,
  },
  search: {
    inputMode: "search",
    returnKeyType: "search",
  },
  username: {
    autoCapitalize: "none",
    autoCorrect: false,
    spellCheck: false,
    autoComplete: "username",
  },
  otp: {
    inputMode: "numeric",
    autoComplete: "one-time-code",
    autoCapitalize: "none",
    autoCorrect: false,
  },
};

export const inputVariants = cva(
  // Keep the focus outline inside the border so form scroll views cannot clip it.
  "min-w-0 rounded-lg border border-input px-3 pt-2 pb-2 text-base font-sans text-foreground placeholder:text-muted-foreground selection:text-ring",
  {
    variants: {
      variant: {
        default:
          "bg-background focus:border-ring focus:outline-2 focus:outline-offset-[-2px] focus:outline-ring",
        filled:
          "bg-muted focus:border-ring focus:outline-2 focus:outline-offset-[-2px] focus:outline-ring",
        ghost: "border-transparent bg-transparent",
      },
      size: {
        sm: "min-h-11",
        default: "min-h-12",
        lg: "min-h-14 px-4 pt-3 pb-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/** A themed TextInput. ref, style, events, and native props reach the input itself. */
export const Input = ({
  ref,
  type = "text",
  variant = "default",
  size = "default",
  className,
  style,
  containerClassName,
  containerStyle,
  disabled = false,
  invalid = false,
  "aria-invalid": ariaInvalid,
  "aria-disabled": ariaDisabled,
  accessibilityState,
  editable,
  readOnly,
  secureTextEntry,
  multiline,
  inputMode,
  keyboardType,
  textContentType,
  showPasswordToggle = true,
  showPasswordLabel = "Show password",
  hidePasswordLabel = "Hide password",
  keyboardSymbols = true,
  ...props
}: InputProps) => {
  const inputRef = useRef<TextInput>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  useImperativeHandle(ref, () => inputRef.current!, []);
  const isPassword = secureTextEntry ?? type === "password";
  const isDisabled =
    disabled || (ariaDisabled ?? accessibilityState?.disabled ?? false);
  const isEditable = !isDisabled && (editable ?? true) && !readOnly;
  const isInvalid = ariaInvalid ?? invalid;
  const hasToggle = isPassword && showPasswordToggle;
  const defaults = INPUT_TYPE_DEFAULTS[type];
  const symbolInput = useKeyboardSymbols(
    inputRef,
    props,
    isEditable && keyboardSymbols,
  );

  return (
    <View
      className={cn("relative self-stretch", containerClassName)}
      style={containerStyle}
    >
      <TextInput
        ref={inputRef}
        autoCorrect={false}
        spellCheck={false}
        {...defaults}
        underlineColorAndroid="transparent"
        textAlignVertical={multiline && !isPassword ? "top" : "center"}
        {...props}
        {...symbolInput}
        // Zero restores UIKit's natural line height. A positive line height adds
        // a baseline offset to entered text that the placeholder does not share.
        style={[
          process.env.EXPO_OS === "ios" && !(multiline && !isPassword)
            ? { lineHeight: 0 }
            : undefined,
          style,
        ]}
        // inputMode takes precedence over keyboardType, so an explicit keyboard wins over a preset.
        inputMode={inputMode ?? (keyboardType ? undefined : defaults.inputMode)}
        keyboardType={keyboardType}
        // Avoid competing autofill hints when the caller chooses an iOS content type.
        autoComplete={
          props.autoComplete ??
          (textContentType ? undefined : (defaults.autoComplete ?? "off"))
        }
        textContentType={textContentType}
        editable={isEditable}
        readOnly={!isEditable}
        aria-disabled={isDisabled}
        aria-invalid={isInvalid}
        accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
        // Secure entry cannot be multiline, even while the password is revealed.
        multiline={isPassword ? false : multiline}
        secureTextEntry={isPassword && !(hasToggle && passwordVisible)}
        className={cn(
          inputVariants({ variant, size }),
          // Explicit edges give native multiline text and its caret room at both ends.
          multiline && !isPassword && "min-h-28 pt-3 pb-3",
          !isEditable && "opacity-50",
          isInvalid &&
            "border-destructive focus:border-destructive focus:outline-destructive",
          hasToggle && "pe-12",
          className,
        )}
      />
      {hasToggle && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute end-0 top-0 h-full w-12 rounded-lg"
          disabled={!isEditable}
          accessibilityLabel={
            passwordVisible ? hidePasswordLabel : showPasswordLabel
          }
          onPress={() => {
            setPasswordVisible((visible) => !visible);
            // Keep typing after toggling instead of leaving focus on the button.
            inputRef.current?.focus();
          }}
        >
          <Icon
            family="Feather"
            name={passwordVisible ? "eye-off" : "eye"}
            size={20}
            className="text-muted-foreground"
            accessible={false}
            aria-hidden
          />
        </Button>
      )}
    </View>
  );
};

import { useDebouncer } from "@tanstack/react-pacer";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchInputProps = {
  initialSearch: string;
  onValueChange: (search: string) => void;
  placeholder?: string;
  inputClassName?: string;
  parentClassName?: string;
};

export const SearchInput = ({
  initialSearch,
  onValueChange,
  placeholder = "Search…",
  inputClassName,
  parentClassName,
}: SearchInputProps) => {
  const [search, setSearch] = useState(initialSearch);
  const [isFocused, setIsFocused] = useState(false);
  const { maybeExecute: handleDebouncedSearch, cancel } = useDebouncer(
    onValueChange,
    { wait: 250 },
  );

  useEffect(() => {
    // A parent reset must also discard any search still waiting to be sent.
    cancel();
    setSearch(initialSearch);
  }, [initialSearch, cancel]);

  return (
    <View
      className={cn(
        "w-full flex-row items-center gap-1.5 rounded-lg border border-input bg-card pl-3",
        isFocused && "border-primary",
        parentClassName,
      )}
    >
      <Icon
        family="Feather"
        name="search"
        size={20}
        className="shrink-0 text-muted-foreground"
        accessible={false}
        aria-hidden
      />
      <Input
        type="search"
        variant="ghost"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          handleDebouncedSearch(value);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        accessibilityLabel={placeholder || "Search"}
        autoCapitalize="none"
        autoCorrect={false}
        containerClassName="min-w-0 flex-1"
        className={cn(
          "border-0 focus:border-transparent focus:outline-0",
          inputClassName,
        )}
      />
    </View>
  );
};

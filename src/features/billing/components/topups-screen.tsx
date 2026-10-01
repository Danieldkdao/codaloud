import { AppWrapper } from "@/components/app-wrapper";
import { Button } from "@/components/ui/button";
import { HeadingText, PText } from "@/components/ui/text";
import { authClient } from "@/lib/auth/auth-client";
import { alert } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { PurchasesStoreProduct } from "react-native-purchases";
import { readBilling } from "../billing-actions";
import { canBuyCreditTopups } from "../billing-rules";
import { creditsForTopup } from "../constants";
import { useBillingStatus } from "../hooks/use-billing-status";
import {
  buyTopupProduct,
  getTopupProducts,
  showTopupsPaywall,
} from "../revenuecat-client";

export const TopupsScreen = () => {
  const userId = authClient.useSession().data?.user.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: status } = useBillingStatus(userId);
  const eligible = canBuyCreditTopups(status);
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || !eligible) return;
    let active = true;
    setProducts([]);
    setLoading(true);
    void getTopupProducts(userId)
      .then((items) => {
        if (active) setProducts(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, eligible]);

  const purchase = async (product: PurchasesStoreProduct) => {
    if (!userId) return;
    setBuying(product.identifier);
    try {
      const current = await readBilling();
      if (!canBuyCreditTopups(current))
        throw new Error("Subscribe before buying a top-up.");
      await buyTopupProduct(userId, product);
      await queryClient.invalidateQueries({ queryKey: ["billing", userId] });
      alert(
        "Purchase received. Your credits will appear once the store confirms it.",
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Purchase could not be completed.",
      );
    } finally {
      setBuying(null);
    }
  };

  return (
    <AppWrapper headerShown>
      <Stack.Screen options={{ title: "Top Ups" }} />
      <View className="w-full max-w-xl gap-5 self-center">
        <HeadingText
          accessibilityRole="header"
          className="text-3xl font-semibold"
        >
          Top Ups
        </HeadingText>
        <PText>
          One-time credits stay with your account even if your subscription
          ends. Monthly credits are always spent first.
        </PText>
        {status && !eligible ? (
          <View className="gap-3 rounded-2xl bg-card p-5">
            <HeadingText className="text-xl font-semibold">
              A paid plan is required
            </HeadingText>
            <PText>
              An active paid plan or Pro trial is required to buy credit packs.
            </PText>
            <Button onPress={() => router.replace("/billing" as Href)}>
              View plans
            </Button>
          </View>
        ) : eligible ? (
          <>
            <Button
              onPress={() =>
                userId &&
                void (async () => {
                  try {
                    const current = await readBilling();
                    if (!canBuyCreditTopups(current))
                      throw new Error("Subscribe before buying a top-up.");
                    await showTopupsPaywall(userId);
                    await queryClient.invalidateQueries({
                      queryKey: ["billing", userId],
                    });
                  } catch (error) {
                    alert(
                      error instanceof Error
                        ? error.message
                        : "Credit packs are unavailable.",
                    );
                  }
                })()
              }
            >
              Browse credit packs
            </Button>
            {loading && <PText>Loading store prices…</PText>}
            {!loading && products.length === 0 && (
              <PText>
                Credit packs are not available from your app store yet.
              </PText>
            )}
            {products.map((product) => (
              <View
                key={product.identifier}
                className="gap-3 rounded-2xl bg-card p-5"
              >
                <HeadingText className="text-xl font-semibold">
                  {creditsForTopup(product.identifier)?.toLocaleString()}{" "}
                  credits
                </HeadingText>
                <PText>
                  {product.priceString} one time ·{" "}
                  {creditsForTopup(product.identifier)} credits
                </PText>
                <Button
                  loading={buying === product.identifier}
                  disabled={Boolean(buying)}
                  onPress={() => void purchase(product)}
                >
                  Buy for {product.priceString}
                </Button>
              </View>
            ))}
            <PText>
              The store confirms the final price before purchase. Custom credit
              amounts need fixed app-store products and are not available yet.
            </PText>
          </>
        ) : (
          <PText>Loading billing status…</PText>
        )}
      </View>
    </AppWrapper>
  );
};

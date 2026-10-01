import { clientEnv } from "@/data/env/client";
import { Linking, Platform } from "react-native";
import Purchases, {
  PRODUCT_CATEGORY,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";

let configurationQueue: Promise<unknown> = Promise.resolve();

export const configureRevenueCat = async (userId: string) => {
  const key =
    Platform.OS === "ios"
      ? clientEnv.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : clientEnv.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  if (!key) return false;
  const configure = async () => {
    if (!(await Purchases.isConfigured()))
      Purchases.configure({ apiKey: key, appUserID: userId });
    if ((await Purchases.getAppUserID()) !== userId)
      await Purchases.logIn(userId);
    return true;
  };
  const result = configurationQueue.then(configure, configure);
  configurationQueue = result;
  return result;
};

export const showPlansPaywall = async (userId: string) => {
  if (!(await configureRevenueCat(userId)))
    throw new Error("Purchases are not configured yet.");
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all.plans;
  if (!offering) throw new Error("Plans are not available yet.");
  await RevenueCatUI.presentPaywall({ offering });
};

export const restoreBillingPurchases = async (userId: string) => {
  if (!(await configureRevenueCat(userId)))
    throw new Error("Purchases are not configured yet.");
  await Purchases.restorePurchases();
};

export const showCustomerCenter = async (userId: string) => {
  if (!(await configureRevenueCat(userId)))
    throw new Error("Purchases are not configured yet.");
  await RevenueCatUI.presentCustomerCenter();
};

export const manageStoreSubscription = async (
  userId: string,
  managementUrl?: string | null,
) => {
  if (Platform.OS === "ios") {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      await Linking.openURL("https://apps.apple.com/account/subscriptions");
      return;
    }
  }
  let url = managementUrl;
  try {
    if (await configureRevenueCat(userId))
      url = (await Purchases.getCustomerInfo()).managementURL ?? url;
  } catch {
    /* The store's management page works even when billing is offline. */
  }
  await Linking.openURL(
    url ?? "https://play.google.com/store/account/subscriptions",
  );
};

export const showTopupsPaywall = async (userId: string) => {
  if (!(await configureRevenueCat(userId)))
    throw new Error("Purchases are not configured yet.");
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all.topups;
  if (!offering) throw new Error("Credit packs are not available yet.");
  await RevenueCatUI.presentPaywall({ offering });
};

export const getTopupProducts = async (userId: string) => {
  if (!(await configureRevenueCat(userId))) return [];
  return Purchases.getProducts(
    [
      "codaloud.credits.100",
      "codaloud.credits.200",
      "codaloud.credits.500",
      "codaloud.credits.1000",
    ],
    PRODUCT_CATEGORY.NON_SUBSCRIPTION,
  );
};

export const buyTopupProduct = async (
  userId: string,
  product: PurchasesStoreProduct,
) => {
  if (!(await configureRevenueCat(userId)))
    throw new Error("Purchases are not configured yet.");
  await Purchases.purchaseStoreProduct(product);
};

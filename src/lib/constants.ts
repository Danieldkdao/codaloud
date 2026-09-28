export const MAIN_TAB_BAR_HEIGHT = 64;

export const themePreferences = ["light", "dark", "system"] as const;

export const MODAL_SCREEN_OPTIONS = {
  presentation: "modal",
  headerTitleStyle: {
    fontFamily: "Fraunces_400Regular",
    fontWeight: "400",
    fontSize: 22,
  },
} as const;

/** Shared by route sheets and the component-local UIKit presenter. */
export const FORM_SHEET_OPTIONS = {
  sheetAllowedDetents: "fitToContents",
  sheetInitialDetentIndex: 0,
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: false,
} as const;

export const DEFAULT_PAGE = 1;
export const PAGE_SIZE = 20;

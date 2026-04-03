import { ReactElement, Suspense, lazy, useEffect, useState } from "react";
import { lazyWithPreload } from "react-lazy-with-preload";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { convertLegacyUrl, isLegacyUrl } from "@/backend/metadata/getmeta";
import { generateQuickSearchMediaUrl } from "@/backend/metadata/tmdb";
import { DetailsModal } from "@/components/overlays/detailsModal";
import { GamepadControlsModal } from "@/components/overlays/GamepadControlsModal";
import { KeyboardCommandsEditModal } from "@/components/overlays/KeyboardCommandsEditModal";
import { KeyboardCommandsModal } from "@/components/overlays/KeyboardCommandsModal";
import { NotificationModal } from "@/components/overlays/notificationsModal";
import { SupportInfoModal } from "@/components/overlays/SupportInfoModal";
import { TraktAuthHandler } from "@/components/TraktAuthHandler";
import { useGlobalKeyboardEvents } from "@/hooks/useGlobalKeyboardEvents";
import { useOnlineListener } from "@/hooks/usePing";
import MaintenancePage from "@/pages/errors/MaintenancePage";
import { NotFoundPage } from "@/pages/errors/NotFoundPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/Login";
import { RegisterPage } from "@/pages/Register";
import { shouldHaveLegalPage } from "@/pages/Legal";
import { Layout } from "@/setup/Layout";
import { useHistoryListener } from "@/stores/history";
import { useClearModalsOnNavigation } from "@/stores/interface/overlayStack";
import { LanguageProvider } from "@/stores/language";

// Critical path (static imports)
// - HomePage: landing page
// - Login/Register: auth
// - Errors: needed on every route

// Lazy loaded routes - secondary pages and features
const AboutPage = lazy(() =>
  import("@/pages/About").then((m) => ({ default: m.AboutPage }))
);
const AdminPage = lazy(() =>
  import("@/pages/admin/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const AllBookmarks = lazy(() =>
  import("@/pages/bookmarks/AllBookmarks").then((m) => ({
    default: m.AllBookmarks,
  }))
);
const Discover = lazy(() =>
  import("@/pages/discover/Discover").then((m) => ({ default: m.Discover }))
);
const DiscoverMore = lazy(() =>
  import("@/pages/discover/AllMovieLists").then((m) => ({
    default: m.DiscoverMore,
  }))
);
const MoreContent = lazy(() =>
  import("@/pages/discover/MoreContent").then((m) => ({
    default: m.MoreContent,
  }))
);
const JipPage = lazy(() =>
  import("@/pages/Jip").then((m) => ({ default: m.JipPage }))
);
const LegalPage = lazy(() =>
  import("@/pages/Legal").then((m) => ({ default: m.LegalPage }))
);
const MigrationPage = lazy(() =>
  import("@/pages/migration/Migration").then((m) => ({
    default: m.MigrationPage,
  }))
);
const MigrationDirectPage = lazy(() =>
  import("@/pages/migration/MigrationDirect").then((m) => ({
    default: m.MigrationDirectPage,
  }))
);
const MigrationDownloadPage = lazy(() =>
  import("@/pages/migration/MigrationDownload").then((m) => ({
    default: m.MigrationDownloadPage,
  }))
);
const MigrationUploadPage = lazy(() =>
  import("@/pages/migration/MigrationUpload").then((m) => ({
    default: m.MigrationUploadPage,
  }))
);
const OnboardingPage = lazy(() =>
  import("@/pages/onboarding/Onboarding").then((m) => ({
    default: m.OnboardingPage,
  }))
);
const OnboardingExtensionPage = lazy(() =>
  import("@/pages/onboarding/OnboardingExtension").then((m) => ({
    default: m.OnboardingExtensionPage,
  }))
);
const OnboardingProxyPage = lazy(() =>
  import("@/pages/onboarding/OnboardingProxy").then((m) => ({
    default: m.OnboardingProxyPage,
  }))
);
const PasPage = lazy(() =>
  import("@/pages/Pas").then((m) => ({ default: m.PasPage }))
);
const SupportPage = lazy(() =>
  import("@/pages/Support").then((m) => ({ default: m.SupportPage }))
);
const WatchHistory = lazy(() =>
  import("@/pages/watchHistory/WatchHistory").then((m) => ({
    default: m.WatchHistory,
  }))
);
const VideoTesterView = lazy(() =>
  import("@/pages/developer/VideoTesterView").then((m) => ({
    default: m.default,
  }))
);

// Developer pages
const DeveloperPage = lazy(() => import("@/pages/DeveloperPage"));
const TestView = lazy(() =>
  import("@/pages/developer/TestView").then((m) => ({
    default: m.default,
  }))
);

// Preloaded routes (loaded on app startup but after critical path)
const PlayerView = lazyWithPreload(() => import("@/pages/PlayerView"));
const SettingsPage = lazyWithPreload(() => import("@/pages/Settings"));

PlayerView.preload();
SettingsPage.preload();

function LegacyUrlView({ children }: { children: ReactElement }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const url = location.pathname;
    if (!isLegacyUrl(url)) return;
    convertLegacyUrl(location.pathname).then((convertedUrl) => {
      navigate(convertedUrl ?? "/", { replace: true });
    });
  }, [location.pathname, navigate]);

  if (isLegacyUrl(location.pathname)) return null;
  return children;
}

function QuickSearch() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      generateQuickSearchMediaUrl(query).then((url) => {
        navigate(url ?? "/", { replace: true });
      });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

function QueryView() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (query) {
      navigate(`/browse/${encodeURIComponent(query)}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [query, navigate]);

  return null;
}

export const maintenanceTime = "March 31th 11:00 PM - 5:00 AM EST";

function App() {
  useHistoryListener();
  useOnlineListener();
  useGlobalKeyboardEvents();
  useClearModalsOnNavigation();
  const maintenance = false; // Shows maintance page
  const [showDowntime, setShowDowntime] = useState(maintenance);

  const handleButtonClick = () => {
    setShowDowntime(false);
  };

  useEffect(() => {
    const sessionToken = sessionStorage.getItem("downtimeToken");
    if (!sessionToken && maintenance) {
      setShowDowntime(true);
      sessionStorage.setItem("downtimeToken", "true");
    }
  }, [setShowDowntime, maintenance]);

  return (
    <Layout>
      <TraktAuthHandler />
      <LanguageProvider />
      <NotificationModal id="notifications" />
      <KeyboardCommandsModal id="keyboard-commands" />
      <KeyboardCommandsEditModal id="keyboard-commands-edit" />
      <GamepadControlsModal id="gamepad-controls-edit" />
      <SupportInfoModal id="support-info" />
      <DetailsModal id="details" />
      <DetailsModal id="discover-details" />
      <DetailsModal id="player-details" />
      {!showDowntime && (
        <Routes>
          {/* functional routes */}
          <Route path="/s/:query" element={<QuickSearch />} />
          <Route path="/search/:type" element={<Navigate to="/browse" />} />
          <Route path="/search/:type/:query?" element={<QueryView />} />
          {/* pages */}
          <Route
            path="/media/:media"
            element={
              <LegacyUrlView>
                <Suspense fallback={null}>
                  <PlayerView />
                </Suspense>
              </LegacyUrlView>
            }
          />
          <Route
            path="/media/:media/:season/:episode"
            element={
              <LegacyUrlView>
                <Suspense fallback={null}>
                  <PlayerView />
                </Suspense>
              </LegacyUrlView>
            }
          />
          <Route path="/browse/:query?" element={<HomePage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/about"
            element={
              <Suspense fallback={null}>
                <AboutPage />
              </Suspense>
            }
          />
          <Route
            path="/onboarding"
            element={
              <Suspense fallback={null}>
                <OnboardingPage />
              </Suspense>
            }
          />
          <Route
            path="/onboarding/extension"
            element={
              <Suspense fallback={null}>
                <OnboardingExtensionPage />
              </Suspense>
            }
          />
          <Route
            path="/onboarding/proxy"
            element={
              <Suspense fallback={null}>
                <OnboardingProxyPage />
              </Suspense>
            }
          />

          {/* Migration pages - awaiting import and export fixes */}
          <Route
            path="/migration"
            element={
              <Suspense fallback={null}>
                <MigrationPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/direct"
            element={
              <Suspense fallback={null}>
                <MigrationDirectPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/download"
            element={
              <Suspense fallback={null}>
                <MigrationDownloadPage />
              </Suspense>
            }
          />
          <Route
            path="/migration/upload"
            element={
              <Suspense fallback={null}>
                <MigrationUploadPage />
              </Suspense>
            }
          />

          {shouldHaveLegalPage() ? (
            <Route
              path="/legal"
              element={
                <Suspense fallback={null}>
                  <LegalPage />
                </Suspense>
              }
            />
          ) : null}
          {/* Support page */}
          <Route
            path="/support"
            element={
              <Suspense fallback={null}>
                <SupportPage />
              </Suspense>
            }
          />
          <Route
            path="/jip"
            element={
              <Suspense fallback={null}>
                <JipPage />
              </Suspense>
            }
          />
          <Route
            path="/pas"
            element={
              <Suspense fallback={null}>
                <PasPage />
              </Suspense>
            }
          />
          {/* Discover pages */}
          <Route
            path="/discover"
            element={
              <Suspense fallback={null}>
                <Discover />
              </Suspense>
            }
          />
          <Route
            path="/discover/more/:contentType/:mediaType"
            element={
              <Suspense fallback={null}>
                <MoreContent />
              </Suspense>
            }
          />
          <Route
            path="/discover/more/:contentType/:id/:mediaType"
            element={
              <Suspense fallback={null}>
                <MoreContent />
              </Suspense>
            }
          />
          <Route
            path="/discover/more/:category"
            element={
              <Suspense fallback={null}>
                <MoreContent />
              </Suspense>
            }
          />
          <Route
            path="/discover/all"
            element={
              <Suspense fallback={null}>
                <DiscoverMore />
              </Suspense>
            }
          />
          {/* Bookmarks page */}
          <Route
            path="/bookmarks"
            element={
              <Suspense fallback={null}>
                <AllBookmarks />
              </Suspense>
            }
          />
          {/* Watch History page */}
          <Route
            path="/watch-history"
            element={
              <Suspense fallback={null}>
                <WatchHistory />
              </Suspense>
            }
          />
          {/* Settings page */}
          <Route
            path="/settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage />
              </Suspense>
            }
          />
          {/* admin routes */}
          <Route
            path="/admin"
            element={
              <Suspense fallback={null}>
                <AdminPage />
              </Suspense>
            }
          />
          {/* other */}
          <Route
            path="/dev"
            element={
              <Suspense fallback={null}>
                <DeveloperPage />
              </Suspense>
            }
          />
          <Route
            path="/dev/video"
            element={
              <Suspense fallback={null}>
                <VideoTesterView />
              </Suspense>
            }
          />
          {/* developer routes that can abuse workers are disabled in production */}
          {process.env.NODE_ENV === "development" ? (
            <Route
              path="/dev/test"
              element={
                <Suspense fallback={null}>
                  <TestView />
                </Suspense>
              }
            />
          ) : null}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
      {showDowntime && (
        <MaintenancePage onHomeButtonClick={handleButtonClick} />
      )}
    </Layout>
  );
}

export default App;

import { iso6393To1 } from "iso-639-3";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { FlagIcon } from "@/components/FlagIcon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import type { AudioTrack } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { getPrettyLanguageNameFromLocale } from "@/utils/language";

import { SelectableLink } from "../../internals/ContextMenu/Links";

function normalizeLanguageCode(language: string) {
  return language.toLowerCase();
}

export function AudioOption(props: {
  langCode?: string;
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <SelectableLink selected={props.selected} onClick={props.onClick}>
      <span className="flex items-center">
        <span data-code={props.langCode} className="mr-3 inline-flex">
          <FlagIcon langCode={props.langCode} />
        </span>
        <span>{props.children}</span>
      </span>
    </SelectableLink>
  );
}

export function AudioView({ id }: { id: string }) {
  const { t } = useTranslation();
  const unknownChoice = t("player.menus.subtitles.unknownLanguage");

  const router = useOverlayRouter(id);
  const audioTracks = usePlayerStore((s) => s.audioTracks);
  const languageStreams = usePlayerStore((s) => s.languageStreams);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const currentLanguageStreamLanguage = usePlayerStore(
    (s) => s.currentLanguageStreamLanguage,
  );
  const changeAudioTrack = usePlayerStore((s) => s.display?.changeAudioTrack);
  const switchLanguageStream = usePlayerStore((s) => s.switchLanguageStream);

  const changeTrack = useCallback(
    (track: AudioTrack) => {
      changeAudioTrack?.(track);
      router.close();
    },
    [router, changeAudioTrack],
  );

  const changeProviderLanguage = useCallback(
    (language: string) => {
      switchLanguageStream(language);
      router.close();
    },
    [router, switchLanguageStream],
  );

  const options = useMemo(() => {
    const merged: Array<
      | { type: "m3u8"; key: string; track: AudioTrack }
      | { type: "provider"; key: string; language: string }
    > = [];
    const seen = new Set<string>();

    audioTracks.forEach((track) => {
      const key = normalizeLanguageCode(track.language);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ type: "m3u8", key, track });
    });

    // Provider language entries are added only when m3u8 doesn't already expose that language.
    languageStreams.forEach((languageStream) => {
      if (!languageStream.language) return;
      const key = normalizeLanguageCode(languageStream.language);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({
        type: "provider",
        key,
        language: languageStream.language,
      });
    });

    return merged;
  }, [audioTracks, languageStreams]);

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>Audio</Menu.BackLink>
      <Menu.Section className="flex flex-col pb-4">
        {options.map((option) => {
          const language =
            option.type === "m3u8" ? option.track.language : option.language;
          const selected =
            option.type === "m3u8"
              ? option.track.id === currentAudioTrack?.id
              : normalizeLanguageCode(option.language) ===
                normalizeLanguageCode(currentLanguageStreamLanguage ?? "");

          return (
            <AudioOption
              key={`${option.type}-${option.key}`}
              selected={selected}
              langCode={
                language.length === 3
                  ? (iso6393To1[language] ?? language)
                  : language
              }
              onClick={
                option.type === "m3u8"
                  ? () => changeTrack(option.track)
                  : () => changeProviderLanguage(option.language)
              }
            >
              {getPrettyLanguageNameFromLocale(language) ??
                (option.type === "m3u8" ? option.track.label : language) ??
                unknownChoice}
            </AudioOption>
          );
        })}
      </Menu.Section>
    </>
  );
}

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

type OverlayType =
	| "volume"
	| "subtitle"
	| "speed"
	| "tidb-submission-success"
	| null;

interface ModalData {
	id: number;
	type: "movie" | "show";
	[key: string]: any;
}

interface OverlayStackStore {
	currentOverlay: OverlayType;
	modalStack: string[];
	// ponytail: id -> stack index, kept in sync inside show/hideModal so
	// Modal no longer needs to call modalStack.indexOf(id) on every render.
	modalIndex: Record<string, number>;
	modalData: Record<string, ModalData | undefined>;
	setCurrentOverlay: (overlay: OverlayType) => void;
	showModal: (id: string, data?: ModalData) => void;
	hideModal: (id: string) => void;
	isModalVisible: (id: string) => boolean;
	getTopModal: () => string | null;
	getModalData: (id: string) => ModalData | undefined;
	clearAllModals: () => void;
}

export const useOverlayStack = create<OverlayStackStore>()(
	immer((set, get) => ({
		currentOverlay: null,
		modalStack: [],
		modalIndex: {},
		modalData: {},
		setCurrentOverlay: (overlay) =>
			set((state) => {
				state.currentOverlay = overlay;
			}),
		showModal: (id: string, data?: ModalData) =>
			set((state) => {
				if (state.modalIndex[id] === undefined) {
					state.modalIndex[id] = state.modalStack.length;
					state.modalStack.push(id);
					// Reindex any other ids after the new push (their index shifted by 1).
					for (let i = 0; i < state.modalStack.length - 1; i += 1) {
						state.modalIndex[state.modalStack[i]!] = i;
					}
				}
				if (data) {
					state.modalData[id] = data;
				}
			}),
		hideModal: (id: string) =>
			set((state) => {
				const idx = state.modalIndex[id];
				if (idx === undefined) return;
				state.modalStack.splice(idx, 1);
				delete state.modalIndex[id];
				// Reindex everything after the splice.
				for (let i = idx; i < state.modalStack.length; i += 1) {
					state.modalIndex[state.modalStack[i]!] = i;
				}
				delete state.modalData[id];
			}),
		isModalVisible: (id: string) => {
			return get().modalIndex[id] !== undefined;
		},
		getTopModal: () => {
			const stack = get().modalStack;
			return stack.length > 0 ? stack[stack.length - 1] : null;
		},
		getModalData: (id: string) => {
			return get().modalData[id];
		},
		clearAllModals: () =>
			set((state) => {
				state.modalStack = [];
				state.modalIndex = {};
				state.modalData = {};
				state.currentOverlay = null;
			}),
	})),
);

// Hook to clear modals on navigation
export function useClearModalsOnNavigation() {
	const location = useLocation();
	const clearAllModals = useOverlayStack((state) => state.clearAllModals);

	useEffect(() => {
		clearAllModals();
	}, [location.pathname, clearAllModals]);
}

import type { FeedbackPayload, FeedbackResponse, FeedbackType } from '../types.js';
/**
 * Controls the feedback dialog and submits reports.
 *
 * Shared open/type state lives in Nuxt's `useState`, so calling `open()` from
 * anywhere in the app drives the single auto-mounted `<FeedbackDialog>`.
 */
export declare function useFeedback(): {
    isOpen: import("vue").Ref<boolean, boolean>;
    type: import("vue").Ref<FeedbackType, FeedbackType>;
    open: (initialType?: FeedbackType) => void;
    close: () => void;
    submit: (payload: FeedbackPayload) => Promise<FeedbackResponse>;
};

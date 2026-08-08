import { createContext, useContext } from "react";

/**
 * Whether the surrounding view is the one currently on screen.
 *
 * Views stay mounted after their first visit so nothing she typed is thrown
 * away. That must not turn into a performance tax: a hidden view keeps its
 * form state but stops running expensive database queries, so scanning tens of
 * thousands of messages doesn't happen in the background of every edit.
 */
export const PaneActive = createContext(true);

export const usePaneActive = () => useContext(PaneActive);

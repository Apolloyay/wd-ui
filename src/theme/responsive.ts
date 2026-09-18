import { useWindowDimensions } from 'react-native';

// Roughly the widest current iPhone (Pro Max) in points -- anything at or
// under this switches screens into the iOS nav-bar/tab-bar layout instead of
// the wide-desktop one, whether that's an actual iPhone or a narrow browser
// window on web.
export const PHONE_MAX_WIDTH = 430;

export function useIsPhoneWidth(): boolean {
  const { width } = useWindowDimensions();
  return width <= PHONE_MAX_WIDTH;
}

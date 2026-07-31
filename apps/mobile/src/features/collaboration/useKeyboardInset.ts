import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * Keeps the conversation composer attached to the iOS keyboard.
 *
 * The native-stack host does not resize its React root when the software
 * keyboard is presented, so KeyboardAvoidingView can leave the composer under
 * the keyboard. Applying the native keyboard frame as a bottom inset keeps the
 * timeline and composer in the same layout and follows interactive dismissal.
 */
export function useKeyboardInset() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const frameSubscription = Keyboard.addListener(
      'keyboardWillChangeFrame',
      event => {
        Keyboard.scheduleLayoutAnimation(event);
        const coveredHeight =
          Dimensions.get('screen').height - event.endCoordinates.screenY;
        setKeyboardHeight(Math.max(0, coveredHeight));
      },
    );
    const hideSubscription = Keyboard.addListener('keyboardWillHide', event => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardHeight(0);
    });

    return () => {
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return keyboardHeight;
}

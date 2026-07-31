import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';

import { authClient } from '@/lib/auth-client';
import { runtime } from '@/lib/runtime';
import { colors, metrics } from '@/theme';

export function SignInScreen() {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = identity.trim().length > 0 && password.length > 0;

  async function signIn() {
    if (!canSubmit || pending) return;
    setPending(true);
    setError(null);
    try {
      const cleanIdentity = identity.trim();
      const result = cleanIdentity.includes('@')
        ? await authClient.signIn.email({
            email: cleanIdentity,
            password,
          })
        : await authClient.signIn.username({
            username: cleanIdentity,
            password,
          });
      if (result.error) {
        setError(
          result.error.message ?? 'The account or password is incorrect.',
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Vector could not sign in. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.page}
    >
      <StatusBar style='auto' />
      <View style={styles.content}>
        <View style={styles.logo}>
          <SymbolView
            name='arrow.up.right.circle.fill'
            size={42}
            tintColor={colors.accent}
          />
        </View>
        <Text style={styles.title}>Welcome to Vector</Text>
        <Text style={styles.subtitle}>
          Sign in to your workspace conversations and agents.
        </Text>

        <View style={styles.form}>
          <TextInput
            autoCapitalize='none'
            autoComplete='username'
            autoCorrect={false}
            autoFocus
            onChangeText={setIdentity}
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholder='Email or username'
            placeholderTextColor={colors.tertiaryLabel}
            returnKeyType='next'
            style={styles.input}
            value={identity}
          />
          <View style={styles.separator} />
          <View style={styles.passwordRow}>
            <TextInput
              autoCapitalize='none'
              autoComplete='current-password'
              onChangeText={setPassword}
              onSubmitEditing={signIn}
              placeholder='Password'
              placeholderTextColor={colors.tertiaryLabel}
              ref={passwordRef}
              returnKeyType='go'
              secureTextEntry={!passwordVisible}
              style={[styles.input, styles.passwordInput]}
              value={password}
            />
            <Pressable
              accessibilityLabel={
                passwordVisible ? 'Hide password' : 'Show password'
              }
              onPress={() => setPasswordVisible(value => !value)}
              style={styles.revealButton}
            >
              <SymbolView
                name={(passwordVisible ? 'eye.slash' : 'eye') as never}
                size={18}
                tintColor={colors.secondaryLabel}
              />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole='button'
          disabled={!canSubmit || pending}
          onPress={signIn}
          style={({ pressed }) => [
            styles.button,
            (!canSubmit || pending) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {pending ? (
            <ActivityIndicator color='white' />
          ) : (
            <Text style={styles.buttonLabel}>Sign in</Text>
          )}
        </Pressable>

        <Text style={styles.server}>
          Server · {runtime.appUrl.replace(/^https?:\/\//, '')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 74,
  },
  logo: { alignItems: 'flex-start', marginBottom: 22 },
  title: {
    color: colors.label,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'left',
  },
  subtitle: {
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 320,
    textAlign: 'left',
  },
  form: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 28,
    overflow: 'hidden',
  },
  input: {
    color: colors.label,
    fontSize: 17,
    height: 54,
    paddingHorizontal: 16,
  },
  passwordRow: { alignItems: 'center', flexDirection: 'row' },
  passwordInput: { flex: 1 },
  revealButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 46,
  },
  separator: {
    backgroundColor: colors.separator,
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  error: {
    color: colors.destructive,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#0099c2',
    borderRadius: metrics.compactRadius,
    height: 50,
    justifyContent: 'center',
    marginTop: 22,
  },
  buttonDisabled: { opacity: 0.42 },
  buttonPressed: { opacity: 0.78 },
  buttonLabel: { color: 'white', fontSize: 17, fontWeight: '600' },
  server: {
    color: colors.tertiaryLabel,
    fontSize: 11,
    marginTop: 18,
    textAlign: 'center',
  },
});

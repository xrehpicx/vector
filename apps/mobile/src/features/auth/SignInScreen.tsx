import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';

import { serverLabel } from '@/lib/server';
import { useServer } from '@/providers/ServerProvider';
import { colors, metrics } from '@/theme';

export function SignInScreen() {
  const { authClient, changeServer, server } = useServer();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverEditing, setServerEditing] = useState(false);
  const [serverDraft, setServerDraft] = useState(serverLabel(server));
  const [serverPending, setServerPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
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

  async function applyServer() {
    if (!serverDraft.trim() || serverPending) return;
    setServerPending(true);
    setServerError(null);
    try {
      await changeServer(serverDraft);
    } catch (caught) {
      setServerError(
        caught instanceof Error
          ? caught.message
          : 'Vector could not connect to this server.',
      );
      setServerPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.page}
    >
      <StatusBar style='auto' />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode='interactive'
        keyboardShouldPersistTaps='handled'
      >
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

        <View style={styles.serverCard}>
          <Pressable
            accessibilityHint='Lets you connect to a different Vector server'
            accessibilityRole='button'
            accessibilityState={{ expanded: serverEditing }}
            onPress={() => {
              setServerError(null);
              setServerEditing(value => !value);
            }}
            style={({ pressed }) => [
              styles.serverRow,
              pressed && styles.serverRowPressed,
            ]}
          >
            <View style={styles.serverIcon}>
              <SymbolView name='network' size={17} tintColor={colors.accent} />
            </View>
            <View style={styles.serverCopy}>
              <Text style={styles.serverLabel}>Server</Text>
              <Text numberOfLines={1} style={styles.serverValue}>
                {serverLabel(server)}
              </Text>
            </View>
            <SymbolView
              name={(serverEditing ? 'chevron.up' : 'chevron.down') as never}
              size={13}
              tintColor={colors.tertiaryLabel}
            />
          </Pressable>

          {serverEditing ? (
            <View style={styles.serverEditor}>
              <TextInput
                autoCapitalize='none'
                autoCorrect={false}
                editable={!serverPending}
                keyboardType='url'
                onChangeText={setServerDraft}
                onSubmitEditing={applyServer}
                placeholder='your-vector-server.com'
                placeholderTextColor={colors.tertiaryLabel}
                returnKeyType='go'
                selectTextOnFocus
                style={styles.serverInput}
                value={serverDraft}
              />
              {serverError ? (
                <Text style={styles.serverError}>{serverError}</Text>
              ) : (
                <Text style={styles.serverHint}>
                  Enter the domain hosting your Vector workspace.
                </Text>
              )}
              <View style={styles.serverActions}>
                <Pressable
                  disabled={serverPending}
                  onPress={() => {
                    setServerDraft(serverLabel(server));
                    setServerError(null);
                    setServerEditing(false);
                  }}
                  style={({ pressed }) => [
                    styles.serverAction,
                    pressed && styles.serverRowPressed,
                  ]}
                >
                  <Text style={styles.serverCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!serverDraft.trim() || serverPending}
                  onPress={applyServer}
                  style={({ pressed }) => [
                    styles.serverUse,
                    (!serverDraft.trim() || serverPending) &&
                      styles.serverUseDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  {serverPending ? (
                    <ActivityIndicator color='white' size='small' />
                  ) : (
                    <Text style={styles.serverUseLabel}>Use server</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

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

        <Text style={styles.privacy}>
          Your password is sent only to {serverLabel(server)} and is never
          stored by Vector.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    paddingBottom: 28,
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
  serverCard: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 26,
    overflow: 'hidden',
  },
  serverRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  serverRowPressed: { backgroundColor: colors.fill },
  serverIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  serverCopy: { flex: 1, marginLeft: 11, minWidth: 0 },
  serverLabel: {
    color: colors.secondaryLabel,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  serverValue: {
    color: colors.label,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  serverEditor: {
    borderTopColor: colors.separator,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  serverInput: {
    backgroundColor: colors.tertiaryBackground,
    borderColor: colors.separator,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.label,
    fontSize: 16,
    height: 44,
    paddingHorizontal: 12,
  },
  serverHint: {
    color: colors.tertiaryLabel,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  serverError: {
    color: colors.destructive,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  serverActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 11,
  },
  serverAction: {
    alignItems: 'center',
    borderRadius: 9,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  serverCancel: {
    color: colors.secondaryLabel,
    fontSize: 14,
    fontWeight: '600',
  },
  serverUse: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 9,
    height: 38,
    justifyContent: 'center',
    minWidth: 104,
    paddingHorizontal: 14,
  },
  serverUseDisabled: { opacity: 0.42 },
  serverUseLabel: { color: 'white', fontSize: 14, fontWeight: '700' },
  form: {
    backgroundColor: colors.secondaryBackground,
    borderColor: colors.separator,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
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
  privacy: {
    color: colors.tertiaryLabel,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 18,
    textAlign: 'center',
  },
});

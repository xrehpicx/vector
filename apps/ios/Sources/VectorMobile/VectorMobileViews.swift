import SwiftUI
#if os(iOS)
  import UIKit
#endif

public struct VectorMobileRootView: View {
  @StateObject private var sessionController: VectorMobileSessionController

  public init(sessionController: VectorMobileSessionController) {
    self._sessionController = StateObject(wrappedValue: sessionController)
  }

  @ViewBuilder
  public var body: some View {
    switch sessionController.phase {
    case .restoring:
      VectorSessionRestoreScreen()
    case .signedOut, .authenticating:
      VectorSetupScreen(sessionController: sessionController)
    case .signedIn:
      if let viewModel = sessionController.viewModel {
        AuthenticatedVectorMobileView(viewModel: viewModel, sessionController: sessionController)
          .id(viewModel.configuration.orgSlug)
      } else {
        VectorSessionRestoreScreen()
      }
    }
  }
}

private struct AuthenticatedVectorMobileView: View {
  @Environment(\.scenePhase) private var scenePhase
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  @StateObject private var pushCoordinator = VectorPushNotificationCoordinator.shared
  @State private var selectedTab: VectorMobileTab = .home
  @State private var isShowingNotificationPrompt = false
  @State private var hasPresentedNotificationPromptThisLaunch = false
  @State private var notificationHrefToOpen: String?

  var body: some View {
    TabView(selection: $selectedTab) {
      NavigationStack {
        MobileConversationHomeScreen(viewModel: viewModel, directOnly: false)
          .vectorTopLevelNavigationChrome(
            viewModel: viewModel,
            sessionController: sessionController
          )
      }
      .tabItem {
        Label(VectorMobileTab.home.title, systemImage: VectorMobileTab.home.systemImage)
      }
      .tag(VectorMobileTab.home)

      NavigationStack {
        MobileConversationHomeScreen(viewModel: viewModel, directOnly: true)
          .vectorTopLevelNavigationChrome(
            viewModel: viewModel,
            sessionController: sessionController
          )
      }
      .tabItem {
        Label(VectorMobileTab.directMessages.title, systemImage: VectorMobileTab.directMessages.systemImage)
      }
      .tag(VectorMobileTab.directMessages)

      NavigationStack {
        InboxScreen(
          viewModel: viewModel,
          sessionController: sessionController,
          notificationHrefToOpen: $notificationHrefToOpen
        )
        .vectorTopLevelNavigationChrome(
          viewModel: viewModel,
          sessionController: sessionController
        )
      }
      .tabItem {
        Label(VectorMobileTab.activity.title, systemImage: VectorMobileTab.activity.systemImage)
      }
      .tag(VectorMobileTab.activity)

      NavigationStack {
        MobileCollaborationSearchScreen(viewModel: viewModel)
          .vectorTopLevelNavigationChrome(
            viewModel: viewModel,
            sessionController: sessionController
          )
      }
      .tabItem {
        Label(VectorMobileTab.search.title, systemImage: VectorMobileTab.search.systemImage)
      }
      .tag(VectorMobileTab.search)

      NavigationStack {
        MobileMoreScreen(
          viewModel: viewModel,
          sessionController: sessionController,
          pushCoordinator: pushCoordinator
        )
        .vectorTopLevelNavigationChrome(
          viewModel: viewModel,
          sessionController: sessionController
        )
      }
      .tabItem {
        Label(VectorMobileTab.more.title, systemImage: VectorMobileTab.more.systemImage)
      }
      .tag(VectorMobileTab.more)
    }
    .tint(VectorTheme.accent)
    .onAppear {
      viewModel.setAuthenticatedUser(sessionController.user)
      if let href = pushCoordinator.pendingNotificationHref {
        openNotification(href)
      }
      refreshNotificationRegistration(shouldPrompt: true)
    }
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      refreshNotificationRegistration(shouldPrompt: false)
    }
    .onChange(of: sessionController.user) { _, user in
      viewModel.setAuthenticatedUser(user)
    }
    .onReceive(pushCoordinator.$deviceToken.compactMap { $0 }.removeDuplicates()) { token in
      viewModel.upsertMobilePushToken(token)
    }
    .onReceive(pushCoordinator.$pendingNotificationHref.compactMap { $0 }) { href in
      openNotification(href)
    }
    .sheet(isPresented: $isShowingNotificationPrompt) {
      NotificationOnboardingSheet(
        viewModel: viewModel,
        pushCoordinator: pushCoordinator,
        onDone: {
          isShowingNotificationPrompt = false
        }
      )
      .presentationDetents([.medium, .large])
    }
    .alert(
      "Workspace switch needs attention",
      isPresented: Binding(
        get: { sessionController.workspaceSwitchError != nil },
        set: { isPresented in
          if !isPresented {
            sessionController.clearWorkspaceSwitchError()
          }
        }
      )
    ) {
      Button("OK") {
        sessionController.clearWorkspaceSwitchError()
      }
    } message: {
      Text(sessionController.workspaceSwitchError ?? "Try switching workspaces again.")
    }
  }

  private func refreshNotificationRegistration(shouldPrompt: Bool) {
    Task { @MainActor in
      await pushCoordinator.registerForRemoteNotificationsIfAuthorized()
      if let token = pushCoordinator.deviceToken {
        viewModel.upsertMobilePushToken(token)
      }

      guard shouldPrompt,
            !sessionController.isDemoMode,
            !hasPresentedNotificationPromptThisLaunch,
            !pushCoordinator.authorizationStatus.allowsRemoteRegistration
      else { return }

      hasPresentedNotificationPromptThisLaunch = true
      try? await Task.sleep(nanoseconds: 450_000_000)
      guard !Task.isCancelled else { return }
      isShowingNotificationPrompt = true
    }
  }

  private func openNotification(_ href: String) {
    let trimmedHref = href.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedHref.isEmpty else {
      pushCoordinator.consumePendingNotificationHref()
      return
    }
    if let target = pendingNotificationTarget(for: trimmedHref),
       target.orgSlug == viewModel.configuration.orgSlug
    {
      selectedTab = .activity
      notificationHrefToOpen = trimmedHref
    } else {
      #if os(iOS)
        let parsedURL = URL(string: trimmedHref)
        let webURL = parsedURL?.scheme == nil
          ? viewModel.configuration.webURL(path: trimmedHref)
          : parsedURL
        if let webURL {
          UIApplication.shared.open(webURL)
        }
      #endif
    }
    pushCoordinator.consumePendingNotificationHref()
  }
}

private struct VectorTopLevelNavigationChrome: ViewModifier {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  @State private var isShowingProfileStatusSettings = false

  func body(content: Content) -> some View {
    content
      .navigationDestination(isPresented: $isShowingProfileStatusSettings) {
        ProfileStatusSettingsScreen(viewModel: viewModel)
      }
      .toolbar {
        #if os(iOS)
          ToolbarItem(placement: .topBarLeading) {
            workspaceMenu
          }
          ToolbarItem(placement: .topBarTrailing) {
            profileMenu
          }
        #else
          ToolbarItem(placement: .automatic) {
            workspaceMenu
          }
          ToolbarItem(placement: .primaryAction) {
            profileMenu
          }
        #endif
      }
  }

  private var workspaceMenu: some View {
    WorkspaceToolbarMenu(
      sessionController: sessionController,
      currentOrgSlug: viewModel.configuration.orgSlug,
      webBaseURL: viewModel.configuration.webBaseURL,
      issuesURL: viewModel.configuration.workspaceWebURL,
      webLabel: "Open workspace on web"
    )
  }

  private var profileMenu: some View {
    ProfileStatusToolbarMenu(
      viewModel: viewModel,
      sessionController: sessionController,
      onOpenProfileStatusSettings: {
        isShowingProfileStatusSettings = true
      }
    )
  }
}

private extension View {
  func vectorTopLevelNavigationChrome(
    viewModel: VectorMobileViewModel,
    sessionController: VectorMobileSessionController
  ) -> some View {
    modifier(
      VectorTopLevelNavigationChrome(
        viewModel: viewModel,
        sessionController: sessionController
      )
    )
  }
}

private enum PendingNotificationTarget {
  case request(orgSlug: String, key: String)
  case work(orgSlug: String, key: String)

  var orgSlug: String {
    switch self {
    case let .request(orgSlug, _), let .work(orgSlug, _): orgSlug
    }
  }
}

private func pendingNotificationTarget(for href: String?) -> PendingNotificationTarget? {
  guard let href, !href.isEmpty else { return nil }
  let path = URL(string: href)?.path ?? href
  let parts = path.split(separator: "/").map(String.init)
  if let index = parts.firstIndex(of: "requests"), index > 0, parts.indices.contains(index + 1) {
    return .request(orgSlug: parts[index - 1], key: parts[index + 1])
  }
  if let index = parts.firstIndex(of: "work"), index > 0, parts.indices.contains(index + 1) {
    return .work(orgSlug: parts[index - 1], key: parts[index + 1])
  }
  return nil
}

private enum VectorMobileTab: String, CaseIterable, Identifiable {
  case home
  case directMessages
  case activity
  case search
  case more

  var id: String { rawValue }

  var title: String {
    switch self {
    case .home: "Home"
    case .directMessages: "DMs"
    case .activity: "Activity"
    case .search: "Search"
    case .more: "More"
    }
  }

  var systemImage: String {
    switch self {
    case .home: "house"
    case .directMessages: "bubble.left.and.bubble.right"
    case .activity: "bell"
    case .search: "magnifyingglass"
    case .more: "ellipsis"
    }
  }
}

private struct VectorSessionRestoreScreen: View {
  var body: some View {
    ZStack {
      VectorAuthBackground()
        .ignoresSafeArea()

      VStack(spacing: 18) {
        Image("VectorLogo")
          .resizable()
          .scaledToFit()
          .frame(width: 62, height: 62)
          .shadow(color: VectorTheme.accent.opacity(0.30), radius: 24, x: 0, y: 12)

        VectorRestoreLoadingIndicator()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct VectorRestoreLoadingIndicator: View {
  var body: some View {
    TimelineView(.animation) { timeline in
      let base = timeline.date.timeIntervalSinceReferenceDate
      HStack(spacing: 4) {
        ForEach(0..<4, id: \.self) { index in
          let phase = sin((base * 4.4) + Double(index) * 0.72)
          Capsule()
            .fill(Color.white.opacity(0.34 + max(phase, 0) * 0.42))
            .frame(width: 4, height: 8 + max(phase, 0) * 10)
        }
      }
      .frame(height: 22)
      .accessibilityLabel("Loading")
    }
  }
}

private struct VectorSetupScreen: View {
  @ObservedObject var sessionController: VectorMobileSessionController
  @Environment(\.colorScheme) private var colorScheme
  @State private var appURLString = "imai.tech"
  @State private var identifier = ""
  @State private var password = ""
  @State private var isConfiguringServer = false

  private var canSubmit: Bool {
    !appURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !password.isEmpty
      && sessionController.phase != .authenticating
  }

  var body: some View {
    NavigationStack {
      ZStack {
        VectorAuthBackground()

        GeometryReader { proxy in
          ScrollView {
            VStack(spacing: 0) {
              VStack(spacing: 28) {
                VectorLoginHero()

                VStack(alignment: .leading, spacing: 12) {
                  VectorNativeLoginForm(
                    identifier: $identifier,
                    password: $password,
                    onSubmit: signIn
                  )

                  VectorServerDisclosure(
                    appURLString: $appURLString,
                    isExpanded: $isConfiguringServer
                  )

                  if let error = sessionController.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                      .font(.footnote)
                      .foregroundStyle(.red)
                      .fixedSize(horizontal: false, vertical: true)
                      .frame(maxWidth: .infinity, alignment: .leading)
                      .padding(12)
                      .background(
                        Color.red.opacity(colorScheme == .dark ? 0.14 : 0.08),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                      )
                  }
                }
                .frame(maxWidth: 380)
              }

              Spacer(minLength: 34)

              VStack(spacing: 10) {
                Button(action: signIn) {
                  HStack(spacing: 8) {
                    if sessionController.phase == .authenticating {
                      ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                    }
                    Text(sessionController.phase == .authenticating ? "Signing in…" : "Sign in")
                      .font(.headline)
                  }
                  .frame(maxWidth: .infinity)
                  .frame(height: 50)
                  .foregroundStyle(Color.white)
                  .background(
                    canSubmit ? VectorTheme.accent : VectorTheme.accent.opacity(0.34),
                    in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                  )
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
                .accessibilityHint("Signs in to the selected Vector server")

                Button {
                  sessionController.useDemoData()
                } label: {
                  Label("Explore demo workspace", systemImage: "sparkles")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .foregroundStyle(.primary)
                    .background(
                      colorScheme == .dark ? Color.white.opacity(0.08) : Color.white,
                      in: RoundedRectangle(cornerRadius: 13, style: .continuous)
                    )
                    .overlay(
                      RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .stroke(Color.primary.opacity(0.10), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
              }
              .frame(maxWidth: 380)
            }
            .frame(maxWidth: 360)
            .frame(minHeight: proxy.size.height)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 22)
            .padding(.top, 34)
            .padding(.bottom, 18)
          }
          .scrollDismissesKeyboard(.interactively)
        }
      }
      .vectorHiddenNavigationBar()
      .onAppear {
        if appURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          appURLString = "imai.tech"
        }
      }
    }
  }

  private func signIn() {
    guard canSubmit else {
      return
    }
    Task {
      await sessionController.signIn(
        appURLString: appURLString,
        identifier: identifier,
        password: password,
        orgSlug: nil
      )
    }
  }
}

private struct VectorAuthBackground: View {
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    ZStack {
      (colorScheme == .dark ? Color.black : Color(white: 0.965))
      RadialGradient(
        colors: [
          VectorTheme.accent.opacity(colorScheme == .dark ? 0.16 : 0.08),
          Color.clear,
        ],
        center: .top,
        startRadius: 0,
        endRadius: 330
      )
    }
    .ignoresSafeArea()
  }
}

private struct VectorLoginHero: View {
  var body: some View {
    VStack(spacing: 14) {
      VectorLogoMark(size: 56)

      VStack(spacing: 7) {
        Text("Sign in to Vector")
          .font(.title2.weight(.bold))
          .foregroundStyle(.primary)
        Text("Open your conversations, work, and connected agents.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Sign in to Vector. Open your conversations, work, and connected agents.")
  }
}

private struct VectorNativeLoginForm: View {
  @Environment(\.colorScheme) private var colorScheme
  @Binding var identifier: String
  @Binding var password: String
  let onSubmit: () -> Void

  var body: some View {
    VectorCredentialFields(identifier: $identifier, password: $password, onSubmit: onSubmit)
      .frame(height: 104)
      .background(
        colorScheme == .dark ? Color.white.opacity(0.075) : Color.white,
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(Color.primary.opacity(0.10), lineWidth: 0.5)
      )
      .shadow(color: Color.black.opacity(colorScheme == .dark ? 0 : 0.05), radius: 14, x: 0, y: 6)
  }
}

private struct VectorServerDisclosure: View {
  @Environment(\.colorScheme) private var colorScheme
  @Binding var appURLString: String
  @Binding var isExpanded: Bool

  private var serverLabel: String {
    let trimmed = appURLString.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Set server" : trimmed
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Button {
        withAnimation(.snappy(duration: 0.24)) {
          isExpanded.toggle()
        }
      } label: {
        HStack(spacing: 8) {
          Image(systemName: "network")
            .font(.caption.weight(.semibold))
          Text("Server")
          Spacer(minLength: 12)
          Text(serverLabel)
            .lineLimit(1)
            .foregroundStyle(.secondary)
          Image(systemName: "chevron.down")
            .font(.caption2.weight(.bold))
            .rotationEffect(.degrees(isExpanded ? 180 : 0))
            .foregroundStyle(.tertiary)
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(.primary)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Vector server, \(serverLabel)")
      .accessibilityHint(isExpanded ? "Collapses server settings" : "Expands server settings")

      if isExpanded {
        VStack(alignment: .leading, spacing: 7) {
          TextField("your-vector-server.com", text: $appURLString)
            .vectorSetupKeyboard(.url)
            .font(.body)
            .tint(VectorTheme.accent)
            .padding(.horizontal, 12)
            .frame(height: 46)
            .background(
              colorScheme == .dark ? Color.white.opacity(0.075) : Color.white,
              in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
            .overlay(
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.10), lineWidth: 0.5)
            )
            .submitLabel(.next)

          Text("Use the domain where your organization hosts Vector.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
  }
}

private struct VectorCredentialFields: View {
  @Binding var identifier: String
  @Binding var password: String
  let onSubmit: () -> Void

  var body: some View {
    #if os(iOS)
      VectorCredentialFieldsRepresentable(
        identifier: $identifier,
        password: $password,
        onSubmit: onSubmit
      )
      .frame(height: 104)
    #else
      VStack(spacing: 0) {
        TextField("Email or username", text: $identifier)
          .vectorSetupKeyboard(.email)
          .padding(.horizontal, 14)
          .frame(height: 52)
        Divider()
          .padding(.leading, 14)
        SecureField("Password", text: $password)
          .onSubmit(onSubmit)
          .padding(.horizontal, 14)
          .frame(height: 52)
      }
    #endif
  }
}

#if os(iOS)
  private struct VectorCredentialFieldsRepresentable: UIViewRepresentable {
    @Binding var identifier: String
    @Binding var password: String
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator {
      Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> CredentialView {
      let view = CredentialView()
      view.accountField.delegate = context.coordinator
      view.passwordField.delegate = context.coordinator
      view.accountField.addTarget(context.coordinator, action: #selector(Coordinator.accountChanged), for: .editingChanged)
      view.passwordField.addTarget(context.coordinator, action: #selector(Coordinator.passwordChanged), for: .editingChanged)
      context.coordinator.view = view
      return view
    }

    func updateUIView(_ view: CredentialView, context: Context) {
      context.coordinator.parent = self

      // AutoFill updates both fields as one transaction. Do not write an older SwiftUI
      // value back between the two UIKit editing events while either field is active.
      guard !view.accountField.isFirstResponder, !view.passwordField.isFirstResponder else {
        return
      }
      if view.accountField.text != identifier {
        view.accountField.text = identifier
      }
      if view.passwordField.text != password {
        view.passwordField.text = password
      }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
      var parent: VectorCredentialFieldsRepresentable
      weak var view: CredentialView?

      init(parent: VectorCredentialFieldsRepresentable) {
        self.parent = parent
      }

      @objc func accountChanged(_ sender: UITextField) {
        parent.identifier = sender.text ?? ""
      }

      @objc func passwordChanged(_ sender: UITextField) {
        parent.password = sender.text ?? ""
      }

      func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        guard let view else {
          return true
        }
        if textField === view.accountField {
          view.passwordField.becomeFirstResponder()
        } else {
          textField.resignFirstResponder()
          parent.onSubmit()
        }
        return true
      }
    }

    final class CredentialView: UIView {
      let accountField = UITextField()
      let passwordField = UITextField()

      override init(frame: CGRect) {
        super.init(frame: frame)
        configureField(accountField, placeholder: "you@example.com")
        accountField.textContentType = .username
        accountField.keyboardType = .emailAddress
        accountField.returnKeyType = .next

        configureField(passwordField, placeholder: "Required")
        passwordField.textContentType = .password
        passwordField.isSecureTextEntry = true
        passwordField.returnKeyType = .go

        let separator = UIView()
        separator.backgroundColor = .separator

        let accountRow = makeRow(title: "Account", field: accountField)
        let passwordRow = makeRow(title: "Password", field: passwordField)
        [accountRow, separator, passwordRow].forEach(addSubview)
        [accountRow, separator, passwordRow].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }

        NSLayoutConstraint.activate([
          accountRow.topAnchor.constraint(equalTo: topAnchor),
          accountRow.leadingAnchor.constraint(equalTo: leadingAnchor),
          accountRow.trailingAnchor.constraint(equalTo: trailingAnchor),
          accountRow.heightAnchor.constraint(equalToConstant: 52),
          separator.topAnchor.constraint(equalTo: accountRow.bottomAnchor),
          separator.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 108),
          separator.trailingAnchor.constraint(equalTo: trailingAnchor),
          separator.heightAnchor.constraint(equalToConstant: 0.5),
          passwordRow.topAnchor.constraint(equalTo: separator.bottomAnchor),
          passwordRow.leadingAnchor.constraint(equalTo: leadingAnchor),
          passwordRow.trailingAnchor.constraint(equalTo: trailingAnchor),
          passwordRow.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
      }

      @available(*, unavailable)
      required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
      }

      private func configureField(_ field: UITextField, placeholder: String) {
        field.font = .preferredFont(forTextStyle: .subheadline)
        field.adjustsFontForContentSizeCategory = true
        field.textColor = .label
        field.tintColor = UIColor(VectorTheme.accent)
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.attributedPlaceholder = NSAttributedString(
          string: placeholder,
          attributes: [.foregroundColor: UIColor.placeholderText]
        )
      }

      private func makeRow(title: String, field: UITextField) -> UIView {
        let label = UILabel()
        label.text = title
        label.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(
          for: .systemFont(ofSize: 15, weight: .medium)
        )
        label.adjustsFontForContentSizeCategory = true
        label.textColor = .label
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.widthAnchor.constraint(equalToConstant: 84).isActive = true

        let stack = UIStackView(arrangedSubviews: [label, field])
        stack.axis = .horizontal
        stack.spacing = 12
        stack.alignment = .fill
        stack.isLayoutMarginsRelativeArrangement = true
        stack.layoutMargins = UIEdgeInsets(top: 0, left: 14, bottom: 0, right: 14)
        return stack
      }
    }
  }
#endif

private enum VectorSetupKeyboard {
  case url
  case email
  case plain
}

private extension View {
  @ViewBuilder
  func vectorSetupKeyboard(_ keyboard: VectorSetupKeyboard) -> some View {
    #if os(iOS)
      switch keyboard {
      case .url:
        self
          .keyboardType(.URL)
          .textContentType(.URL)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      case .email:
        self
          .keyboardType(.emailAddress)
          .textContentType(.username)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      case .plain:
        self
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      }
    #else
      self
    #endif
  }
}

private struct VectorLogoMark: View {
  let size: CGFloat

  var body: some View {
    Image("VectorLogo")
      .resizable()
      .scaledToFit()
      .padding(size * 0.24)
      .frame(width: size, height: size)
      .background(
        Color.black,
        in: RoundedRectangle(cornerRadius: min(size * 0.18, 8), style: .continuous)
      )
      .accessibilityLabel("Vector")
  }
}

private struct CompactSearchField: View {
  @Binding var text: String
  let prompt: String

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      TextField(prompt, text: $text)
        .font(.subheadline)
        .vectorSetupKeyboard(.plain)
    }
    .padding(.horizontal, 10)
    .frame(height: 34)
    .background(VectorTheme.rowBackground, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    .vectorShadowRing(cornerRadius: 7)
  }
}

private struct CompactSegmentedControl<Option: Hashable>: View {
  let options: [Option]
  @Binding var selection: Option
  let label: (Option) -> String

  var body: some View {
    HStack(spacing: 0) {
      ForEach(options, id: \.self) { option in
        Button {
          selection = option
        } label: {
          Text(label(option))
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .frame(maxWidth: .infinity)
            .frame(height: 30)
            .foregroundStyle(selection == option ? Color.primary : Color.secondary)
            .background(selection == option ? VectorTheme.rowBackground : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
      }
    }
    .padding(2)
    .background(Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
  }
}

private struct VectorEmptyState: View {
  let title: String
  let systemImage: String
  let message: String

  var body: some View {
    VStack(spacing: 10) {
      Image(systemName: systemImage)
        .font(.system(size: 28, weight: .semibold))
        .foregroundStyle(VectorTheme.accent)
        .frame(width: 48, height: 48)
        .background(VectorTheme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

      VStack(spacing: 4) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.primary)
        Text(message)
          .font(.caption)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(.horizontal, 32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct PagingTrigger: View {
  let canLoadMore: Bool
  let isLoading: Bool
  let action: () -> Void

  var body: some View {
    Group {
      if canLoadMore || isLoading {
        HStack {
          if isLoading {
            ProgressView()
              .controlSize(.small)
              .tint(VectorTheme.accent)
          }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .onAppear {
          if canLoadMore {
            action()
          }
        }
      }
    }
  }
}

struct InboxScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  @Binding var notificationHrefToOpen: String?
  var body: some View {
    ScrollView {
      if viewModel.inboxNotifications.isEmpty {
        VectorEmptyState(
          title: "Inbox is clear",
          systemImage: "bell",
          message: "Assignments, mentions, comments, and status updates that need your attention will appear here."
        )
        .frame(minHeight: 420)
      } else {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(Array(viewModel.inboxNotifications.enumerated()), id: \.element.id) { index, notification in
            InboxNotificationNavigationRow(
              notification: notification,
              isLast: index == viewModel.inboxNotifications.count - 1,
              viewModel: viewModel
            )
          }

          PagingTrigger(
            canLoadMore: viewModel.canLoadMoreInboxNotifications,
            isLoading: viewModel.isLoadingMoreInboxNotifications,
            action: viewModel.loadMoreInboxNotifications
          )
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 24)
      }
    }
    .background(VectorTheme.rowBackground)
    .navigationTitle("Inbox")
    .vectorInlineNavigationTitle()
    .navigationDestination(isPresented: notificationDestinationPresented) {
      notificationDestination
    }
  }

  private var notificationDestinationPresented: Binding<Bool> {
    Binding(
      get: { pendingNotificationTarget(for: notificationHrefToOpen) != nil },
      set: { isPresented in
        if !isPresented { notificationHrefToOpen = nil }
      }
    )
  }

  @ViewBuilder
  private var notificationDestination: some View {
    switch pendingNotificationTarget(for: notificationHrefToOpen) {
    case let .request(_, key):
      MobileRequestDetailScreen(request: requestTarget(key), viewModel: viewModel)
    case let .work(_, key):
      MobileWorkDetailScreen(work: workTarget(key), viewModel: viewModel)
    case nil:
      EmptyView()
    }
  }

  private func requestTarget(_ key: String) -> VectorRequestRow {
    if let request = viewModel.requests.first(where: { $0.key == key }) { return request }
    if let notification = viewModel.inboxNotifications.first(where: { $0.requestKey == key }) {
      return VectorRequestRow(
        id: notification.requestId ?? key,
        key: key,
        title: notification.title,
        expectedOutput: notification.body,
        status: notification.eventType == "request_ready_for_review"
          ? .readyForReview
          : notification.eventType == "request_changes_requested" ? .changesRequested : .new,
        createdAt: notification.createdAt,
        updatedAt: notification.createdAt
      )
    }
    return VectorRequestRow(
      id: key,
      key: key,
      title: key,
      expectedOutput: "Open this Request to review its expected output.",
      status: .new,
      createdAt: 0,
      updatedAt: 0
    )
  }

  private func workTarget(_ key: String) -> VectorWorkRow {
    if let work = viewModel.work.first(where: { $0.key == key }) { return work }
    if let notification = viewModel.inboxNotifications.first(where: { $0.workKey == key }) {
      return VectorWorkRow(
        id: notification.issueId ?? key,
        key: key,
        title: notification.title,
        workStatus: notification.eventType == "work_ready_for_review"
          ? .readyForReview
          : notification.eventType == "work_completed"
            ? .completed
            : notification.eventType == "work_blocked" ? .blocked : .planned,
        creationTime: notification.createdAt
      )
    }
    return VectorWorkRow(
      id: key,
      key: key,
      title: key,
      workStatus: .planned,
      creationTime: 0
    )
  }
}

private struct InboxNotificationNavigationRow: View {
  let notification: VectorInboxNotification
  let isLast: Bool
  @ObservedObject var viewModel: VectorMobileViewModel

  private var requestTarget: VectorRequestRow? {
    guard let key = notification.requestKey else {
      return nil
    }
    if let request = viewModel.requests.first(where: { $0.key == key }) {
      return request
    }
    let status: VectorRequestStatus = notification.eventType == "request_ready_for_review"
      ? .readyForReview
      : notification.eventType == "request_changes_requested" ? .changesRequested : .new
    return VectorRequestRow(
      id: notification.requestId ?? key,
      key: key,
      title: notification.title,
      expectedOutput: notification.body,
      status: status,
      createdAt: notification.createdAt,
      updatedAt: notification.createdAt
    )
  }

  private var workTarget: VectorWorkRow? {
    guard let key = notification.workKey else { return nil }
    if let work = viewModel.work.first(where: { $0.key == key }) { return work }
    let status: VectorWorkStatus = notification.eventType == "work_ready_for_review"
      ? .readyForReview
      : notification.eventType == "work_completed" ? .completed : notification.eventType == "work_blocked" ? .blocked : .planned
    return VectorWorkRow(
      id: notification.issueId ?? key,
      key: key,
      title: notification.title,
      workStatus: status,
      creationTime: notification.createdAt
    )
  }

  var body: some View {
    Group {
      if let requestTarget {
        NavigationLink {
          MobileRequestDetailScreen(request: requestTarget, viewModel: viewModel)
        } label: {
          InboxNotificationRow(
            notification: notification,
            isLast: isLast,
            baseURL: viewModel.configuration.webBaseURL
          )
        }
      } else if let workTarget {
        NavigationLink {
          MobileWorkDetailScreen(work: workTarget, viewModel: viewModel)
        } label: {
          InboxNotificationRow(
            notification: notification,
            isLast: isLast,
            baseURL: viewModel.configuration.webBaseURL
          )
        }
      } else {
        Link(destination: webURL) {
          InboxNotificationRow(
            notification: notification,
            isLast: isLast,
            baseURL: viewModel.configuration.webBaseURL
          )
        }
      }
    }
    .buttonStyle(.plain)
  }

  private var webURL: URL {
    guard let href = notification.href, !href.isEmpty else {
      return viewModel.configuration.workspaceWebURL
    }
    if let absolute = URL(string: href), absolute.scheme != nil {
      return absolute
    }
    let normalizedPath = href.hasPrefix("/") ? String(href.dropFirst()) : href
    return viewModel.configuration.webBaseURL.appending(path: normalizedPath)
  }
}

private struct InboxNotificationRow: View {
  let notification: VectorInboxNotification
  let isLast: Bool
  let baseURL: URL

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack(alignment: .top) {
        if !isLast {
          Rectangle()
            .fill(VectorTheme.border.opacity(0.35))
            .frame(width: 1)
            .offset(y: 24)
        }

        Image(systemName: systemImage)
          .font(.caption2.weight(.semibold))
          .symbolRenderingMode(.monochrome)
          .foregroundStyle(iconColor)
          .frame(width: 20, height: 20)
          .background(VectorTheme.rowBackground, in: Circle())
          .overlay(Circle().stroke(VectorTheme.border.opacity(0.55), lineWidth: 0.8))
      }
      .frame(width: 28, alignment: .top)
      .frame(minHeight: 54, alignment: .top)

      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(notification.title)
            .font(.subheadline.weight(notification.isRead ? .regular : .semibold))
            .foregroundStyle(.primary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 8)
          Text(relativeTimestamp(notification.createdAt))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        if !notification.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Text(notification.body)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(3)
            .fixedSize(horizontal: false, vertical: true)
        }

        if let actor = notification.actor {
          HStack(spacing: 6) {
            VectorUserAvatar(user: actor, baseURL: baseURL, size: 18)
            Text(actor.displayName)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          .padding(.top, 1)
        }
      }
      .padding(.bottom, isLast ? 0 : 14)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var systemImage: String {
    switch notification.category {
    case .assignments: "checklist"
    case .mentions: "at"
    case .comments: "text.bubble"
    case .invites: "envelope"
    case .workSessions: "terminal"
    case .teamStatusChanges: "person.wave.2"
    case .requests: "tray"
    case .handoffs: "arrow.left.arrow.right"
    case .reviews: "checkmark.seal"
    case .attention: "exclamationmark.bubble"
    case .reminders: "alarm"
    case .github: "chevron.left.forwardslash.chevron.right"
    case .unknown: "bell"
    }
  }

  private var iconColor: Color {
    switch notification.category {
    case .assignments: Color(vectorHex: "#22c55e")
    case .mentions: Color(vectorHex: "#8b5cf6")
    case .comments: Color(vectorHex: "#0ea5e9")
    case .invites: Color(vectorHex: "#f59e0b")
    case .workSessions: Color(vectorHex: "#14b8a6")
    case .teamStatusChanges: Color(vectorHex: "#06b6d4")
    case .requests: Color(vectorHex: "#6366f1")
    case .handoffs: Color(vectorHex: "#f97316")
    case .reviews: Color(vectorHex: "#a855f7")
    case .attention: Color(vectorHex: "#ef4444")
    case .reminders: Color(vectorHex: "#eab308")
    case .github: Color(vectorHex: "#64748b")
    case .unknown: Color.secondary
    }
  }
}

private struct InboxActivityNavigationRow: View {
  let activity: VectorActivityItem
  let isLast: Bool
  @ObservedObject var viewModel: VectorMobileViewModel

  private var issueTarget: VectorIssueRow? {
    guard activity.target.type == "issue" else { return nil }
    if let issue = viewModel.issues.first(where: { issue in
      issue.id == activity.target.id || issue.key == activity.target.key
    }) {
      return issue
    }

    guard let key = activity.target.key?.trimmingCharacters(in: .whitespacesAndNewlines), !key.isEmpty else {
      return nil
    }

    return VectorIssueRow(
      id: activity.target.id ?? key,
      key: key,
      title: activity.target.name ?? key,
      creationTime: activity.createdAt,
      updatedAt: activity.createdAt
    )
  }

  var body: some View {
    Group {
      if let issueTarget {
        NavigationLink {
          IssueDetailScreen(
            issue: issueTarget,
            viewModel: viewModel,
            scrollTarget: IssueDetailScrollTarget(activity: activity)
          )
        } label: {
          InboxActivityRow(
            activity: activity,
            isLast: isLast,
            baseURL: viewModel.configuration.webBaseURL
          )
        }
      } else {
        Link(destination: webURL) {
          InboxActivityRow(
            activity: activity,
            isLast: isLast,
            baseURL: viewModel.configuration.webBaseURL
          )
        }
      }
    }
    .buttonStyle(.plain)
  }

  private var webURL: URL {
    switch activity.target.type {
    case "issue":
      if let key = activity.target.key {
        return viewModel.configuration.webURL(path: "/\(viewModel.configuration.orgSlug)/issues/\(key)")
      }
    case "project":
      if let key = activity.target.key {
        return viewModel.configuration.webURL(path: "/\(viewModel.configuration.orgSlug)/projects/\(key)")
      }
    case "team":
      if let key = activity.target.key {
        return viewModel.configuration.webURL(path: "/\(viewModel.configuration.orgSlug)/teams/\(key)")
      }
    default:
      break
    }
    return viewModel.configuration.workspaceWebURL
  }
}

private struct InboxActivityRow: View {
  let activity: VectorActivityItem
  let isLast: Bool
  let baseURL: URL

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack(alignment: .top) {
        if !isLast {
          Rectangle()
            .fill(VectorTheme.border.opacity(0.35))
            .frame(width: 1)
            .offset(y: 24)
        }
        Image(systemName: systemImage)
          .font(.caption2.weight(.semibold))
          .symbolRenderingMode(.monochrome)
          .foregroundStyle(iconColor)
          .frame(width: 20, height: 20)
          .background(VectorTheme.rowBackground, in: Circle())
          .overlay(Circle().stroke(VectorTheme.border.opacity(0.55), lineWidth: 0.8))
      }
      .frame(width: 28, alignment: .top)
      .frame(minHeight: 48, alignment: .top)

      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          activityText
            .font(.subheadline)
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 10)
          Text(relativeTimestamp(activity.createdAt))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        if let targetLabel {
          Text(targetLabel)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        if let preview = activity.details.commentPreview, !preview.isEmpty {
          if activity.eventType == "issue_comment_added" {
            HStack(alignment: .top, spacing: 8) {
              VectorUserAvatar(user: activity.actor, baseURL: baseURL, size: 22)
              Text(preview)
                .font(.subheadline)
                .foregroundStyle(.primary.opacity(0.78))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 2)
          } else {
            Text(preview)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
        }
      }
      .padding(.bottom, isLast ? 0 : 14)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var actorName: String {
    activity.actor?.displayName ?? "Someone"
  }

  private var targetLabel: String? {
    let name = activity.target.name ?? activity.target.key
    guard let name else { return nil }
    if let key = activity.target.key, key != name {
      return "\(key) · \(name)"
    }
    return name
  }

  private var activityText: Text {
    Text("\(Text(actorName).fontWeight(.semibold)) \(description)")
  }

  private var description: String {
    switch activity.eventType {
    case "issue_created":
      "created an issue"
    case "issue_title_changed":
      "updated an issue title"
    case "issue_description_changed":
      "updated a description"
    case "issue_workflow_state_changed":
      "changed a status"
    case "issue_priority_changed":
      "changed a priority"
    case "issue_assignees_changed":
      assignmentDescription
    case "issue_project_changed":
      "changed an issue project"
    case "issue_team_changed":
      "changed an issue team"
    case "issue_comment_added":
      "commented"
    default:
      "updated \(activity.target.type)"
    }
  }

  private var assignmentDescription: String {
    if !activity.details.addedUserNames.isEmpty {
      return "assigned \(activity.details.addedUserNames.joined(separator: ", "))"
    }
    if !activity.details.removedUserNames.isEmpty {
      return "unassigned \(activity.details.removedUserNames.joined(separator: ", "))"
    }
    return "changed assignees"
  }

  private var systemImage: String {
    switch activity.eventType {
    case "issue_created":
      "plus"
    case "issue_comment_added":
      "text.bubble"
    case "issue_assignees_changed":
      "person.2"
    case "issue_workflow_state_changed", "issue_assignment_state_changed":
      "circle.circle"
    case "issue_title_changed", "issue_description_changed":
      "textformat"
    case "issue_priority_changed":
      "arrow.left.arrow.right"
    case "issue_project_changed", "issue_project_added", "issue_project_removed":
      "folder"
    case "issue_team_changed", "issue_team_added", "issue_team_removed":
      "person.2"
    case "issue_visibility_changed":
      "eye"
    case "issue_live_activity_started",
      "issue_live_activity_delegated",
      "issue_live_activity_completed",
      "issue_live_activity_status_changed":
      "terminal"
    default:
      "doc.text"
    }
  }

  private var iconColor: Color {
    switch activity.eventType {
    case "issue_created", "issue_sub_issue_created":
      Color(vectorHex: "#8b5cf6")
    case "issue_workflow_state_changed",
      "issue_assignment_state_changed",
      "issue_live_activity_started",
      "issue_live_activity_delegated":
      Color(vectorHex: "#22c55e")
    case "issue_priority_changed":
      Color(vectorHex: "#f97316")
    case "issue_assignees_changed", "issue_comment_added":
      Color(vectorHex: "#3b82f6")
    default:
      Color.secondary
    }
  }
}

struct IssuesScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  @State private var searchText = ""
  @State private var isSearchPresented = false
  @State private var isCreateIssuePresented = false
  @FocusState private var isSearchFocused: Bool

  private var filteredIssues: [VectorIssueRow] {
    guard isSearchActive else {
      return viewModel.issues
    }
    return viewModel.issues.filter {
      $0.key.localizedCaseInsensitiveContains(searchText)
        || $0.title.localizedCaseInsensitiveContains(searchText)
    }
  }

  private var isSearchActive: Bool {
    !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 8) {
        if isSearchPresented || !searchText.isEmpty {
          HStack(spacing: 8) {
            TextField("Search issues", text: $searchText)
              .textFieldStyle(.roundedBorder)
              .focused($isSearchFocused)
              .submitLabel(.search)
            Button("Cancel") {
              withAnimation(.snappy(duration: 0.18)) {
                searchText = ""
                isSearchPresented = false
                isSearchFocused = false
              }
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.plain)
            .foregroundStyle(VectorTheme.accent)
          }
          .transition(.move(edge: .top).combined(with: .opacity))
        }

        HStack(spacing: 8) {
          CompactSegmentedControl(options: VectorIssueScope.allCases, selection: $viewModel.issueScope) { $0.label }
            .onChange(of: viewModel.issueScope) {
              viewModel.refresh()
            }
          IssueLayoutMenu(selection: $viewModel.issueLayoutMode)
        }
      }
      .padding(12)

      content
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(VectorTheme.rowBackground)
    .navigationTitle("Issues")
    .vectorInlineNavigationTitle()
    .toolbar {
      #if os(iOS)
      ToolbarItem(placement: .topBarLeading) {
        WorkspaceToolbarMenu(
          sessionController: sessionController,
          currentOrgSlug: viewModel.configuration.orgSlug,
          webBaseURL: viewModel.configuration.webBaseURL,
          issuesURL: viewModel.configuration.webURL(path: "/\(viewModel.configuration.orgSlug)/issues")
        )
      }
      #else
      ToolbarItem(placement: .automatic) {
        WorkspaceToolbarMenu(
          sessionController: sessionController,
          currentOrgSlug: viewModel.configuration.orgSlug,
          webBaseURL: viewModel.configuration.webBaseURL,
          issuesURL: viewModel.configuration.webURL(path: "/\(viewModel.configuration.orgSlug)/issues")
        )
      }
      #endif

      ToolbarItemGroup(placement: .primaryAction) {
        Button {
          isCreateIssuePresented = true
        } label: {
          Image(systemName: "plus")
        }
        .accessibilityLabel("Create issue")

        Button {
          withAnimation(.snappy(duration: 0.18)) {
            isSearchPresented.toggle()
            if !isSearchPresented {
              isSearchFocused = false
            }
          }
        } label: {
          Image(systemName: isSearchPresented ? "xmark" : "magnifyingglass")
        }
        .accessibilityLabel(isSearchPresented ? "Hide search" : "Search issues")
      }
    }
    .sheet(isPresented: $isCreateIssuePresented) {
      CreateIssueSheet(viewModel: viewModel) {
        isCreateIssuePresented = false
      }
      .presentationDetents([.medium, .large])
    }
    .onChange(of: isSearchPresented) { _, presented in
      if presented {
        Task { @MainActor in
          try? await Task.sleep(nanoseconds: 120_000_000)
          isSearchFocused = true
        }
      }
    }
  }

  @ViewBuilder private var content: some View {
    if viewModel.isLoading && filteredIssues.isEmpty {
      SkeletonIssueList()
    } else if let error = viewModel.errorMessage {
      ContentUnavailableView("Unable to load issues", systemImage: "wifi.exclamationmark", description: Text(error))
    } else if filteredIssues.isEmpty {
      VectorEmptyState(
        title: searchText.isEmpty ? "No issues" : "No matching issues",
        systemImage: "checklist",
        message: searchText.isEmpty ? "Issues assigned or visible to you will appear here." : "Try a different issue key or title."
      )
    } else {
      switch viewModel.issueLayoutMode {
      case .list:
        IssueList(issues: filteredIssues, viewModel: viewModel, allowsPaging: !isSearchActive)
      case .board:
        IssueBoard(issues: filteredIssues, viewModel: viewModel, allowsPaging: !isSearchActive)
      case .timeline:
        IssueTimeline(issues: filteredIssues, viewModel: viewModel, allowsPaging: !isSearchActive)
      }
    }
  }
}

struct WorkspaceToolbarMenu: View {
  @ObservedObject var sessionController: VectorMobileSessionController
  let currentOrgSlug: String
  let webBaseURL: URL
  let issuesURL: URL
  var webLabel = "Open issues on web"

  private var currentWorkspace: VectorOrganization? {
    sessionController.organizations.first { $0.slug == currentOrgSlug }
  }

  private var currentWorkspaceName: String {
    currentWorkspace?.name ?? currentOrgSlug
  }

  var body: some View {
    Menu {
      WorkspaceMenuContent(
        sessionController: sessionController,
        currentOrgSlug: currentOrgSlug,
        webURL: issuesURL,
        webLabel: webLabel
      )
    } label: {
      WorkspaceAvatarIcon(
        name: currentWorkspaceName,
        logoURL: currentWorkspace?.logoURL(baseURL: webBaseURL),
        size: 28
      )
    }
    .accessibilityLabel("Workspace menu, \(currentWorkspaceName)")
  }
}

private struct WorkspaceAvatarIcon: View {
  let name: String
  let logoURL: URL?
  var size: CGFloat = 26

  private var initial: String {
    name.trimmingCharacters(in: .whitespacesAndNewlines).first.map { String($0).uppercased() } ?? "V"
  }

  var body: some View {
    ZStack {
      Circle()
        .fill(VectorTheme.accent.opacity(0.14))
        .overlay(
          Circle()
            .stroke(VectorTheme.accent.opacity(0.28), lineWidth: 0.8)
        )

      if let logoURL {
        AsyncImage(url: logoURL) { phase in
          switch phase {
          case let .success(image):
            image
              .resizable()
              .scaledToFill()
          default:
            Text(initial)
              .font(.system(size: max(11, size * 0.44), weight: .semibold))
              .foregroundStyle(VectorTheme.accent)
          }
        }
      } else {
        Text(initial)
          .font(.system(size: max(11, size * 0.44), weight: .semibold))
          .foregroundStyle(VectorTheme.accent)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }
}

private struct WorkspaceMenuContent: View {
  @ObservedObject var sessionController: VectorMobileSessionController
  let currentOrgSlug: String
  let webURL: URL
  let webLabel: String

  var body: some View {
    if !sessionController.organizations.isEmpty {
      Section("Workspaces") {
        ForEach(sessionController.organizations) { organization in
          Button {
            sessionController.switchWorkspace(to: organization)
          } label: {
            Label(
              organization.name,
              systemImage: organization.slug == currentOrgSlug ? "checkmark" : "building.2"
            )
          }
          .disabled(organization.slug == currentOrgSlug || sessionController.isDemoMode)
        }
      }
    }

    Section {
      Link(destination: webURL) {
        Label(webLabel, systemImage: "safari")
      }
    }
  }
}

private struct ProfileStatusToolbarMenu: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  let onOpenProfileStatusSettings: () -> Void

  private var workspaceUser: VectorUser? {
    guard let sessionUser = sessionController.user else {
      return nil
    }

    return viewModel.workspaceOptions?.members.first { member in
      if let userId = member.userId, let sessionUserId = sessionUser.id, userId == sessionUserId {
        return true
      }
      if let email = member.email,
        let sessionEmail = sessionUser.email,
        email.caseInsensitiveCompare(sessionEmail) == .orderedSame
      {
        return true
      }
      return false
    }?.user
  }

  private var toolbarUser: VectorUser {
    let user = sessionController.user
    return VectorUser(
      id: user?.id ?? user?.email ?? "current-user",
      name: workspaceUser?.name ?? user?.displayName,
      email: workspaceUser?.email ?? user?.email,
      image: user?.image ?? workspaceUser?.image,
      status: viewModel.userStatus
    )
  }

  var body: some View {
    Menu {
      if let user = sessionController.user {
        Section(user.displayName) {
          if let email = user.email {
            Text(email)
          }
        }
      }

      Section("Presence") {
        ForEach(VectorPresenceStatus.selectableCases) { presence in
          Button {
            viewModel.setPresence(presence)
          } label: {
            ProfilePresenceMenuRow(
              presence: presence,
              isSelected: viewModel.userStatus?.presence == presence,
              isPending: viewModel.pendingPresence == presence
            )
          }
          .disabled(viewModel.pendingPresence == presence)
        }
      }

      Section {
        Button(action: onOpenProfileStatusSettings) {
          Label("Profile status", systemImage: "person.crop.circle.badge.checkmark")
        }
      }
    } label: {
      VectorUserAvatar(user: toolbarUser, baseURL: viewModel.configuration.webBaseURL, size: 28)
    }
    .accessibilityLabel("Profile and status")
    .onAppear {
      viewModel.loadSettings()
    }
  }
}

private struct ProfilePresenceMenuRow: View {
  let presence: VectorPresenceStatus
  let isSelected: Bool
  let isPending: Bool

  var body: some View {
    HStack(spacing: 10) {
      ProfilePresenceGlyph(presence: presence, isSelected: isSelected)

      Text(labelText)

      Spacer(minLength: 12)

      if isPending {
        ProgressView()
          .controlSize(.small)
      } else if isSelected {
        Image(systemName: "checkmark")
          .font(.caption.weight(.bold))
          .foregroundStyle(Color(vectorHex: presence.colorHex))
      }
    }
  }

  private var labelText: String {
    if isPending {
      return "\(presence.label) (updating)"
    }
    if isSelected {
      return "\(presence.label) (current)"
    }
    return presence.label
  }
}

private struct ProfilePresenceGlyph: View {
  let presence: VectorPresenceStatus
  let isSelected: Bool

  private var color: Color {
    Color(vectorHex: presence.colorHex)
  }

  var body: some View {
    ZStack {
      Circle()
        .fill(color.opacity(isSelected ? 0.18 : 0.10))
      Image(systemName: presence.systemImage)
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(color)
    }
    .frame(width: 20, height: 20)
    .overlay(
      Circle()
        .stroke(color.opacity(isSelected ? 0.52 : 0.24), lineWidth: isSelected ? 1.1 : 0.8)
    )
  }
}

private struct WorkspaceSettingsRow: View {
  @ObservedObject var sessionController: VectorMobileSessionController
  let currentOrgSlug: String

  private var currentWorkspaceLabel: String {
    sessionController.organizations.first { $0.slug == currentOrgSlug }?.name ?? currentOrgSlug
  }

  var body: some View {
    Menu {
      if !sessionController.organizations.isEmpty {
        ForEach(sessionController.organizations) { organization in
          Button {
            sessionController.switchWorkspace(to: organization)
          } label: {
            Label(
              organization.name,
              systemImage: organization.slug == currentOrgSlug ? "checkmark" : "building.2"
            )
          }
          .disabled(organization.slug == currentOrgSlug || sessionController.isDemoMode)
        }
      }
    } label: {
      HStack {
        Text("Workspace")
        Spacer()
        Text(currentWorkspaceLabel)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Image(systemName: "chevron.up.chevron.down")
          .font(.caption2.weight(.bold))
          .foregroundStyle(.secondary)
      }
    }
    .disabled(sessionController.organizations.count <= 1 || sessionController.isDemoMode)
  }
}

private struct IssueLayoutMenu: View {
  @Binding var selection: VectorIssueLayoutMode

  var body: some View {
    Menu {
      ForEach(VectorIssueLayoutMode.allCases, id: \.self) { mode in
        Button {
          selection = mode
        } label: {
          Label(mode.label, systemImage: mode == selection ? "checkmark" : mode.systemImage)
        }
      }
    } label: {
      HStack(spacing: 6) {
        Image(systemName: selection.systemImage)
          .font(.caption.weight(.semibold))
        Text(selection.label)
          .font(.caption.weight(.semibold))
          .lineLimit(1)
        Image(systemName: "chevron.down")
          .font(.caption2.weight(.bold))
      }
      .foregroundStyle(Color.primary)
      .padding(.horizontal, 10)
      .frame(height: 34)
      .background(VectorTheme.rowBackground, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
      .vectorShadowRing(cornerRadius: 7)
      .contentShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

private extension VectorIssueLayoutMode {
  var systemImage: String {
    switch self {
    case .list: "list.bullet"
    case .board: "rectangle.grid.2x2"
    case .timeline: "clock"
    }
  }
}

private struct CreateIssueSheet: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  let onClose: () -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var title = ""
  @State private var description = ""
  @State private var selectedProject: VectorProject?
  @State private var selectedTeam: VectorTeam?
  @State private var selectedState: VectorState?
  @State private var selectedPriority: VectorPriority?
  @State private var selectedAssigneeIds = Set<VectorID>()
  @State private var isCreating = false
  @State private var errorMessage: String?
  @FocusState private var isTitleFocused: Bool

  private var canCreate: Bool {
    !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isCreating
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          TextField("Issue title", text: $title, axis: .vertical)
            .font(.title3.weight(.semibold))
            .textFieldStyle(.plain)
            .focused($isTitleFocused)
            .submitLabel(.done)

          ZStack(alignment: .topLeading) {
            if description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              Text("Description")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .padding(.vertical, 8)
            }
            TextEditor(text: $description)
              .font(.subheadline)
              .frame(minHeight: 120)
              .scrollContentBackground(.hidden)
          }
          .background(VectorTheme.groupedBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          .vectorShadowRing(cornerRadius: 8)

          LazyVGrid(columns: [GridItem(.adaptive(minimum: 136), spacing: 8)], alignment: .leading, spacing: 8) {
            CreateIssueMenu(
              label: selectedState?.name ?? "Status",
              systemImage: vectorSystemImage(for: selectedState?.icon),
              color: Color(vectorHex: selectedState?.color)
            ) {
              ForEach(viewModel.workspaceOptions?.issueStates ?? []) { state in
                Button {
                  selectedState = state
                } label: {
                  Label(state.name, systemImage: selectedState?.id == state.id ? "checkmark" : vectorSystemImage(for: state.icon))
                }
              }
            }

            CreateIssueMenu(
              label: selectedPriority?.name ?? "Priority",
              systemImage: vectorSystemImage(for: selectedPriority?.icon),
              color: Color(vectorHex: selectedPriority?.color)
            ) {
              Button {
                selectedPriority = nil
              } label: {
                Label("No priority", systemImage: selectedPriority == nil ? "checkmark" : "minus")
              }
              ForEach(viewModel.workspaceOptions?.issuePriorities ?? []) { priority in
                Button {
                  selectedPriority = priority
                } label: {
                  Label(priority.name, systemImage: selectedPriority?.id == priority.id ? "checkmark" : vectorSystemImage(for: priority.icon))
                }
              }
            }

            CreateIssueMenu(
              label: selectedAssigneeLabel,
              systemImage: "person.crop.circle",
              color: .secondary
            ) {
              Button {
                selectedAssigneeIds = []
              } label: {
                Label("Unassigned", systemImage: selectedAssigneeIds.isEmpty ? "checkmark" : "person.slash")
              }
              ForEach((viewModel.workspaceOptions?.members ?? []).filter { $0.userId != nil }) { member in
                let userId = member.userId ?? member.id
                Button {
                  if selectedAssigneeIds.contains(userId) {
                    selectedAssigneeIds.remove(userId)
                  } else {
                    selectedAssigneeIds.insert(userId)
                  }
                } label: {
                  Label(member.displayName, systemImage: selectedAssigneeIds.contains(userId) ? "checkmark" : "person")
                }
              }
            }

            CreateIssueMenu(
              label: selectedProject?.key ?? "Project",
              systemImage: vectorSystemImage(for: selectedProject?.icon),
              color: Color(vectorHex: selectedProject?.color)
            ) {
              Button {
                selectedProject = nil
              } label: {
                Label("No project", systemImage: selectedProject == nil ? "checkmark" : "folder")
              }
              ForEach(viewModel.workspaceOptions?.projects ?? []) { project in
                Button {
                  selectedProject = project
                } label: {
                  Label(project.name, systemImage: selectedProject?.id == project.id ? "checkmark" : vectorSystemImage(for: project.icon))
                }
              }
            }

            CreateIssueMenu(
              label: selectedTeam?.key ?? "Team",
              systemImage: vectorSystemImage(for: selectedTeam?.icon),
              color: Color(vectorHex: selectedTeam?.color)
            ) {
              Button {
                selectedTeam = nil
              } label: {
                Label("No team", systemImage: selectedTeam == nil ? "checkmark" : "person.2")
              }
              ForEach(viewModel.workspaceOptions?.teams ?? []) { team in
                Button {
                  selectedTeam = team
                } label: {
                  Label(team.name, systemImage: selectedTeam?.id == team.id ? "checkmark" : vectorSystemImage(for: team.icon))
                }
              }
            }
          }

          if let errorMessage {
            Label(errorMessage, systemImage: "exclamationmark.triangle")
              .font(.caption)
              .foregroundStyle(.red)
          }
        }
        .padding(18)
      }
      .background(VectorTheme.rowBackground)
      .navigationTitle("Create Issue")
      .vectorInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            dismiss()
            onClose()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button {
            createIssue()
          } label: {
            if isCreating {
              ProgressView()
            } else {
              Text("Create")
            }
          }
          .disabled(!canCreate)
        }
      }
      .onAppear {
        selectedState = viewModel.workspaceOptions?.issueStates.first { $0.type == "todo" }
          ?? viewModel.workspaceOptions?.issueStates.first
        Task { @MainActor in
          try? await Task.sleep(nanoseconds: 150_000_000)
          isTitleFocused = true
        }
      }
    }
  }

  private var selectedAssigneeLabel: String {
    if selectedAssigneeIds.isEmpty {
      return "Assignee"
    }
    if selectedAssigneeIds.count == 1,
      let selectedId = selectedAssigneeIds.first,
      let member = viewModel.workspaceOptions?.members.first(where: { $0.userId == selectedId })
    {
      return member.displayName
    }
    return "\(selectedAssigneeIds.count) assignees"
  }

  private func createIssue() {
    guard canCreate else {
      return
    }

    isCreating = true
    errorMessage = nil
    Task { @MainActor in
      do {
        _ = try await viewModel.createIssue(
          title: title,
          description: description,
          project: selectedProject,
          team: selectedTeam,
          state: selectedState,
          priority: selectedPriority,
          assigneeIds: Array(selectedAssigneeIds)
        )
        dismiss()
        onClose()
      } catch {
        errorMessage = error.localizedDescription
      }
      isCreating = false
    }
  }
}

private struct CreateIssueMenu<Content: View>: View {
  let label: String
  let systemImage: String
  let color: Color
  let content: Content

  init(
    label: String,
    systemImage: String,
    color: Color,
    @ViewBuilder content: () -> Content
  ) {
    self.label = label
    self.systemImage = systemImage
    self.color = color
    self.content = content()
  }

  var body: some View {
    Menu {
      content
    } label: {
      HStack(spacing: 6) {
        Image(systemName: systemImage)
          .font(.caption.weight(.semibold))
          .foregroundStyle(color)
        Text(label)
          .font(.caption.weight(.semibold))
          .lineLimit(1)
        Spacer(minLength: 4)
        Image(systemName: "chevron.down")
          .font(.caption2.weight(.bold))
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 10)
      .frame(height: 34)
      .background(VectorTheme.groupedBackground, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
      .vectorShadowRing(cornerRadius: 7)
    }
    .buttonStyle(.plain)
  }
}

struct IssueList: View {
  let issues: [VectorIssueRow]
  @ObservedObject var viewModel: VectorMobileViewModel
  let allowsPaging: Bool

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 0) {
        ForEach(issues, id: \.rowId) { issue in
          NavigationLink {
            IssueDetailScreen(issue: issue, viewModel: viewModel)
          } label: {
            IssueRowView(
              issue: issue,
              workspaceOptions: viewModel.workspaceOptions,
              baseURL: viewModel.configuration.webBaseURL
            )
              .padding(.horizontal, 12)
              .padding(.vertical, 11)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)

          Divider()
            .padding(.leading, 12)
        }

        PagingTrigger(
          canLoadMore: allowsPaging && viewModel.canLoadMoreIssues,
          isLoading: allowsPaging && viewModel.isLoadingMoreIssues,
          action: viewModel.loadMoreIssues
        )
      }
    }
    .background(VectorTheme.rowBackground)
  }
}

struct IssueBoard: View {
  let issues: [VectorIssueRow]
  @ObservedObject var viewModel: VectorMobileViewModel
  let allowsPaging: Bool

  private var groups: [(name: String, position: Double, status: VectorIssueMetadataValue, rows: [VectorIssueRow])] {
    let options = viewModel.workspaceOptions

    return Dictionary(grouping: issues) { issue in
      VectorIssueMetadataResolver.state(for: issue, options: options).name
    }
    .map { name, rows in
      let status = rows.first.map {
        VectorIssueMetadataResolver.state(for: $0, options: options)
      } ?? VectorIssueMetadataValue(id: nil, name: name, icon: nil, color: nil)
      let position = rows
        .compactMap { issue in
          guard let stateId = issue.workflowStateId else {
            return nil
          }

          return options?.issueStates.first { $0.id == stateId }?.position
        }
        .min() ?? Double.greatestFiniteMagnitude

      return (
        name: name,
        position: position,
        status: status,
        rows: rows.sorted { $0.updatedAt > $1.updatedAt }
      )
    }
    .sorted {
      if $0.position == $1.position {
        return $0.name < $1.name
      }

      return $0.position < $1.position
    }
  }

  var body: some View {
    ScrollView {
      ScrollView(.horizontal) {
        LazyHStack(alignment: .top, spacing: 10) {
          ForEach(groups, id: \.name) { group in
            VStack(alignment: .leading, spacing: 8) {
              HStack(spacing: 6) {
                Image(systemName: vectorSystemImage(for: group.status.icon))
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(Color(vectorHex: group.status.color))
                Text(group.name)
                  .font(.subheadline.weight(.semibold))
                Text("\(group.rows.count)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }

              ForEach(group.rows, id: \.rowId) { issue in
                NavigationLink {
                  IssueDetailScreen(issue: issue, viewModel: viewModel)
                } label: {
                  IssueBoardCard(
                    issue: issue,
                    workspaceOptions: viewModel.workspaceOptions,
                    baseURL: viewModel.configuration.webBaseURL
                  )
                }
                .buttonStyle(.plain)
              }
            }
            .padding(10)
            .frame(width: 282, alignment: .topLeading)
            .background(VectorTheme.groupedBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .vectorShadowRing(cornerRadius: 8)
          }
        }
        .padding(12)
      }

      PagingTrigger(
        canLoadMore: allowsPaging && viewModel.canLoadMoreIssues,
        isLoading: allowsPaging && viewModel.isLoadingMoreIssues,
        action: viewModel.loadMoreIssues
      )
    }
  }
}

struct IssueTimeline: View {
  let issues: [VectorIssueRow]
  @ObservedObject var viewModel: VectorMobileViewModel
  let allowsPaging: Bool

  private var groups: [(String, [VectorIssueRow])] {
    let sorted = issues.sorted { $0.updatedAt > $1.updatedAt }
    let grouped = Dictionary(grouping: sorted) { issue in
      let age = Date().timeIntervalSince1970 * 1000 - issue.updatedAt
      return age < 86_400_000 ? "Today" : "Earlier"
    }
    return ["Today", "Earlier"].compactMap { key in
      guard let rows = grouped[key], !rows.isEmpty else { return nil }
      return (key, rows)
    }
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
        ForEach(groups, id: \.0) { group in
          Text(group.0)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.top, 14)
            .padding(.bottom, 6)

          ForEach(group.1, id: \.rowId) { issue in
            NavigationLink {
              IssueDetailScreen(issue: issue, viewModel: viewModel)
            } label: {
              TimelineIssueRow(
                issue: issue,
                workspaceOptions: viewModel.workspaceOptions,
                baseURL: viewModel.configuration.webBaseURL
              )
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Divider()
              .padding(.leading, 12)
          }
        }

        PagingTrigger(
          canLoadMore: allowsPaging && viewModel.canLoadMoreIssues,
          isLoading: allowsPaging && viewModel.isLoadingMoreIssues,
          action: viewModel.loadMoreIssues
        )
      }
    }
    .background(VectorTheme.rowBackground)
  }
}

struct IssueRowView: View {
  let issue: VectorIssueRow
  let workspaceOptions: VectorWorkspaceOptions?
  let baseURL: URL

  private var status: VectorIssueMetadataValue {
    VectorIssueMetadataResolver.state(for: issue, options: workspaceOptions)
  }

  private var priority: VectorIssueMetadataValue? {
    VectorIssueMetadataResolver.priority(for: issue, options: workspaceOptions)
  }

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Text(issue.title)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.primary)
        .lineLimit(1)
        .truncationMode(.tail)
      .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)

      HStack(spacing: 5) {
        IssueMetadataIcon(value: status, fallbackSystemImage: "circle")

        if let priority {
          IssueMetadataIcon(value: priority, fallbackSystemImage: "minus")
        }

        IssueRowAssigneeAvatar(issue: issue, workspaceOptions: workspaceOptions, baseURL: baseURL)
      }
      .layoutPriority(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct IssueMetadataIcon: View {
  let value: VectorIssueMetadataValue
  let fallbackSystemImage: String
  var size: CGFloat = 24

  private var color: Color {
    Color(vectorHex: value.color)
  }

  var body: some View {
    let mappedSystemImage = vectorSystemImage(for: value.icon)
    let systemImage = mappedSystemImage == "circle.dotted" ? fallbackSystemImage : mappedSystemImage

    Image(systemName: systemImage)
      .font(.caption.weight(.semibold))
      .foregroundStyle(color)
      .frame(width: size, height: size)
      .background(color.opacity(0.12), in: Circle())
      .overlay(Circle().stroke(color.opacity(0.28), lineWidth: 0.7))
      .accessibilityLabel(value.name)
  }
}

private struct IssueRowAssigneeAvatar: View {
  let issue: VectorIssueRow
  let workspaceOptions: VectorWorkspaceOptions?
  let baseURL: URL

  private var user: VectorUser? {
    guard issue.assigneeId != nil || issue.assigneeName != nil || issue.assigneeEmail != nil || issue.assigneeImage != nil else {
      return nil
    }

    return VectorUser(
      id: issue.assigneeId ?? issue.assigneeEmail ?? issue.assigneeName ?? "assignee",
      name: issue.assigneeName,
      email: issue.assigneeEmail,
      image: issue.assigneeImage,
      status: workspaceOptions?.memberStatus(userId: issue.assigneeId, email: issue.assigneeEmail)
    )
  }

  var body: some View {
    Group {
      if let user {
        VectorUserAvatar(user: user, baseURL: baseURL, size: 24)
      } else {
        Image(systemName: "person.crop.circle")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
          .frame(width: 24, height: 24)
          .background(Color.secondary.opacity(0.10), in: Circle())
          .overlay(Circle().stroke(VectorTheme.border.opacity(0.25), lineWidth: 0.5))
      }
    }
    .accessibilityLabel("Assignee: \(issue.assigneeLabel)")
  }
}

struct IssueBoardCard: View {
  let issue: VectorIssueRow
  let workspaceOptions: VectorWorkspaceOptions?
  let baseURL: URL

  private var status: VectorIssueMetadataValue {
    VectorIssueMetadataResolver.state(for: issue, options: workspaceOptions)
  }

  private var priority: VectorIssueMetadataValue? {
    VectorIssueMetadataResolver.priority(for: issue, options: workspaceOptions)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(issue.title)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.primary)
        .lineLimit(2)

      HStack {
        IssueMetadataIcon(value: status, fallbackSystemImage: "circle", size: 22)
        if let priority {
          IssueMetadataIcon(value: priority, fallbackSystemImage: "minus", size: 22)
        }
        IssueRowAssigneeAvatar(issue: issue, workspaceOptions: workspaceOptions, baseURL: baseURL)
        Spacer()
        if !issue.linkedPrs.isEmpty {
          Image(systemName: "point.3.connected.trianglepath.dotted")
            .font(.caption)
            .foregroundStyle(VectorTheme.accent)
        }
        if let dueDate = issue.dueDate {
          Text(dueDate)
            .font(.caption2.monospaced())
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding(10)
    .background(VectorTheme.rowBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .stroke(VectorTheme.border.opacity(0.28), lineWidth: 0.7)
    )
  }
}

struct TimelineIssueRow: View {
  let issue: VectorIssueRow
  let workspaceOptions: VectorWorkspaceOptions?
  let baseURL: URL

  private var status: VectorIssueMetadataValue {
    VectorIssueMetadataResolver.state(for: issue, options: workspaceOptions)
  }

  private var priority: VectorIssueMetadataValue? {
    VectorIssueMetadataResolver.priority(for: issue, options: workspaceOptions)
  }

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      IssueMetadataIcon(value: status, fallbackSystemImage: "circle", size: 22)

      VStack(alignment: .leading, spacing: 4) {
        Text(issue.title)
          .font(.subheadline.weight(.medium))
          .lineLimit(1)
        Text("Updated \(relativeTimestamp(issue.updatedAt))")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)

      HStack(spacing: 5) {
        if let priority {
          IssueMetadataIcon(value: priority, fallbackSystemImage: "minus", size: 22)
        }
        IssueRowAssigneeAvatar(issue: issue, workspaceOptions: workspaceOptions, baseURL: baseURL)
      }
    }
    .padding(.vertical, 4)
  }
}

struct IssueDetailScrollTarget: Equatable {
  let entryID: String
  let commentID: VectorID?

  init(activity: VectorActivityItem) {
    if let commentId = activity.details.commentId {
      self.entryID = "comment:\(commentId)"
      self.commentID = commentId
    } else {
      self.entryID = "activity:\(activity.id)"
      self.commentID = nil
    }
  }
}

struct IssueDetailScreen: View {
  let issue: VectorIssueRow
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var draftTitle = ""
  @State private var draftDescription = ""
  @State private var isEditingDescription = false
  @State private var isSavingDocument = false
  @State private var isPostingComment = false
  @State private var commentDraft = ""
  @State private var descriptionFormatCommand: VectorRichTextCommand?
  @State private var descriptionFormatState = VectorRichTextFormatState()
  @State private var commentFormatCommand: VectorRichTextCommand?
  @State private var commentFormatState = VectorRichTextFormatState()
  @State private var activeReplyParentId: VectorID?
  @State private var postingReplyParentId: VectorID?
  @State private var replyDrafts: [VectorID: String] = [:]
  @State private var replyFormatCommands: [VectorID: VectorRichTextCommand] = [:]
  @State private var replyFormatStates: [VectorID: VectorRichTextFormatState] = [:]
  @State private var pendingProperty: IssueDetailProperty?
  @State private var issueErrorMessage: String?
  @State private var pendingScrollTarget: IssueDetailScrollTarget?
  @State private var highlightedEntryID: String?
  @State private var hasLoadedResolvedIssueSupport = false
  @State private var focusedField: IssueDetailFocusField?
  @FocusState private var isTitleFocused: Bool

  init(issue: VectorIssueRow, viewModel: VectorMobileViewModel, scrollTarget: IssueDetailScrollTarget? = nil) {
    self.issue = issue
    self._viewModel = ObservedObject(wrappedValue: viewModel)
    self._pendingScrollTarget = State(initialValue: scrollTarget)
  }

  private var displayIssue: VectorIssueRow {
    if let selectedIssue = viewModel.selectedIssue, selectedIssue.id == issue.id || selectedIssue.key == issue.key {
      return selectedIssue
    }
    return viewModel.issues.first { $0.id == issue.id || $0.key == issue.key } ?? issue
  }

  private var canEditIssue: Bool {
    displayIssue.canEdit ?? false
  }

  private var selectedAssigneeIds: Set<VectorID> {
    let assignmentIds = viewModel.assignments.compactMap(\.assigneeId)
    if !assignmentIds.isEmpty {
      return Set(assignmentIds)
    }
    if let assigneeId = displayIssue.assigneeId {
      return [assigneeId]
    }
    return []
  }

  private var hasDocumentChanges: Bool {
    draftTitle.trimmingCharacters(in: .whitespacesAndNewlines) != displayIssue.title
      || draftDescription != (displayIssue.description ?? "")
  }

  private var activeFormatState: VectorRichTextFormatState {
    switch focusedField {
    case .description:
      descriptionFormatState
    case .mainComment:
      commentFormatState
    case let .replyComment(parentId):
      replyFormatStates[parentId] ?? VectorRichTextFormatState()
    case .title, nil:
      VectorRichTextFormatState()
    }
  }

  private var timelineEntries: [IssueTimelineEntry] {
    let commentEntries = viewModel.comments
      .filter { $0.parentId == nil }
      .map(IssueTimelineEntry.comment)
    let activityEntries = viewModel.issueActivity
      .filter { $0.eventType != "issue_comment_added" }
      .map(IssueTimelineEntry.activity)

    return (commentEntries + activityEntries).sorted { $0.createdAt < $1.createdAt }
  }

  private var repliesByParent: [VectorID: [VectorComment]] {
    Dictionary(grouping: viewModel.comments.filter { $0.parentId != nil }) { comment in
      comment.parentId ?? ""
    }
    .mapValues { replies in
      replies.sorted { $0.creationTime < $1.creationTime }
    }
  }

  private var timelineEntryIDs: [String] {
    timelineEntries.map(\.id)
  }

  var body: some View {
    ScrollViewReader { scrollProxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 10) {
          Text(displayIssue.key)
            .font(.caption.monospaced())
            .foregroundStyle(.secondary)

          if canEditIssue {
            TextField("Issue title", text: $draftTitle, axis: .vertical)
              .font(.system(size: 28, weight: .semibold))
              .textFieldStyle(.plain)
              .focused($isTitleFocused)
              .submitLabel(.done)
              .onSubmit(saveDocumentChanges)
              .onChange(of: isTitleFocused) { _, isFocused in
                if isFocused {
                  focusedField = .title
                } else if focusedField == .title {
                  focusedField = nil
                }
              }
          } else {
            Text(displayIssue.title)
              .font(.system(size: 28, weight: .semibold))
              .foregroundStyle(.primary)
              .fixedSize(horizontal: false, vertical: true)
          }

          IssuePropertyBar(
            issue: displayIssue,
            options: viewModel.workspaceOptions,
            selectedAssigneeIds: selectedAssigneeIds,
            pendingProperty: pendingProperty,
            isEditable: canEditIssue,
            onStateSelect: { state in
              runPropertyUpdate(.status) {
                try await viewModel.changeIssueWorkflowState(issueId: displayIssue.id, state: state)
              }
            },
            onPrioritySelect: { priority in
              runPropertyUpdate(.priority) {
                try await viewModel.changeIssuePriority(issueId: displayIssue.id, priority: priority)
              }
            },
            onAssigneesSelect: { assigneeIds in
              runPropertyUpdate(.assignees) {
                try await viewModel.updateIssueAssignees(issueId: displayIssue.id, assigneeIds: assigneeIds)
              }
            },
            onProjectSelect: { project in
              runPropertyUpdate(.project) {
                try await viewModel.changeIssueProject(issueId: displayIssue.id, project: project)
              }
            },
            onTeamSelect: { team in
              runPropertyUpdate(.team) {
                try await viewModel.changeIssueTeam(issueId: displayIssue.id, team: team)
              }
            },
            onVisibilitySelect: { visibility in
              runPropertyUpdate(.visibility) {
                try await viewModel.changeIssueVisibility(issueId: displayIssue.id, visibility: visibility.rawValue)
              }
            }
          )
          .padding(.horizontal, -22)
        }

        DocumentSection(title: "Description") {
          if !canEditIssue {
            if draftDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              Text("No description")
                .font(.body)
                .foregroundStyle(.secondary)
            } else {
              MarkdownDocumentView(markdown: draftDescription)
            }
          } else if isEditingDescription || draftDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            ZStack(alignment: .topLeading) {
              if draftDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("Add description")
                  .font(.body)
                  .foregroundStyle(.secondary)
                  .padding(.horizontal, 4)
                  .padding(.vertical, 8)
              }

              VectorRichTextEditor(
                text: $draftDescription,
                minHeight: 220,
                fontSize: 17,
                formatCommand: descriptionFormatCommand,
                isFocused: focusedField == .description,
                onFocusChange: { isFocused in
                  focusedField = isFocused ? .description : nil
                },
                onFormatStateChange: { state in
                  descriptionFormatState = state
                }
              )
            }
            .background(Color.clear)
          } else {
            Button {
              withAnimation(.snappy(duration: 0.18)) {
                isEditingDescription = true
                focusedField = .description
              }
            } label: {
              MarkdownDocumentView(markdown: draftDescription)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }

          HStack(spacing: 10) {
            if canEditIssue && !isEditingDescription && !draftDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              Button("Edit description") {
                withAnimation(.snappy(duration: 0.18)) {
                  isEditingDescription = true
                  focusedField = .description
                }
              }
              .font(.caption.weight(.semibold))
              .buttonStyle(.plain)
              .foregroundStyle(VectorTheme.accent)
            }

            Spacer()

            if canEditIssue && (isEditingDescription || hasDocumentChanges) {
              Button(action: saveDocumentChanges) {
                HStack(spacing: 6) {
                  if isSavingDocument {
                    ProgressView()
                      .controlSize(.small)
                  }
                  Text(hasDocumentChanges ? "Save changes" : "Done")
                }
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .frame(height: 30)
                .background(VectorTheme.accent.opacity(hasDocumentChanges ? 0.15 : 0.08), in: Capsule())
              }
              .buttonStyle(.plain)
              .disabled(isSavingDocument)
            }
          }
        }

        DocumentSection(title: "Activity") {
          if timelineEntries.isEmpty {
            VectorEmptyState(
              title: "No activity",
              systemImage: "rays",
              message: "Comments and issue updates will appear here."
            )
            .frame(minHeight: 180)
          } else {
            VStack(alignment: .leading, spacing: 0) {
              ForEach(Array(timelineEntries.enumerated()), id: \.element.id) { index, entry in
                if index > 0 {
                  let spacing = timelineSpacing(before: index)
                  if spacing > 0 {
                    Color.clear.frame(height: spacing)
                  }
                }

                timelineEntryView(entry, isLast: index == timelineEntries.count - 1)
                  .id(entry.id)
                  .padding(.horizontal, highlightedEntryID == entry.id ? 8 : 0)
                  .padding(.vertical, highlightedEntryID == entry.id ? 6 : 0)
                  .background(
                    highlightedEntryID == entry.id ? VectorTheme.accent.opacity(0.10) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                  )
                  .animation(.snappy(duration: 0.18), value: highlightedEntryID)
              }
            }
          }

          IssueCommentComposer(
            text: $commentDraft,
            isPosting: isPostingComment,
            placeholder: "Leave a comment... Use @ to mention",
            members: viewModel.workspaceOptions?.members ?? [],
            baseURL: viewModel.configuration.webBaseURL,
            focusTarget: .mainComment,
            focusedField: $focusedField,
            formatCommand: commentFormatCommand,
            onFormatStateChange: { state in
              commentFormatState = state
            },
            onSubmit: postComment
          )
          .onChange(of: focusedField) { _, focusedField in
            if focusedField == .mainComment {
              activeReplyParentId = nil
            }
          }
        }

        if let issueErrorMessage {
          Label(issueErrorMessage, systemImage: "exclamationmark.triangle")
            .font(.caption)
            .foregroundStyle(.red)
            .fixedSize(horizontal: false, vertical: true)
        }
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
        .padding(.bottom, 148)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(VectorTheme.rowBackground)
      .navigationTitle(displayIssue.key)
      .vectorInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Link(destination: viewModel.openWebURL(for: displayIssue)) {
            Image(systemName: "safari")
          }
          .accessibilityLabel("Open full issue on web")
        }
        #if os(iOS)
        ToolbarItemGroup(placement: .keyboard) {
          if focusedField?.showsMarkdownToolbar == true {
            MarkdownFormattingKeyboardToolbar(
              formatState: activeFormatState,
              onAction: { action in
                applyMarkdownFormatting(action)
              },
              onDismiss: {
                focusedField = nil
              }
            )
          }
        }
        #endif
      }
      .onAppear {
        syncDraft(from: displayIssue)
        viewModel.loadIssueSupport(issue: displayIssue)
        scrollToPendingTarget(with: scrollProxy)
      }
      .onChange(of: displayIssue) { _, nextIssue in
        let isReplacingPlaceholder = nextIssue.id != issue.id && nextIssue.key == issue.key
        if isReplacingPlaceholder && !hasLoadedResolvedIssueSupport {
          hasLoadedResolvedIssueSupport = true
          viewModel.loadIssueSupport(issue: nextIssue)
          syncDraft(from: nextIssue)
          return
        }
        guard !hasDocumentChanges && !isEditingDescription else {
          return
        }
        syncDraft(from: nextIssue)
      }
      .onChange(of: timelineEntryIDs) {
        scrollToPendingTarget(with: scrollProxy)
      }
    }
  }

  @ViewBuilder
  private func timelineEntryView(_ entry: IssueTimelineEntry, isLast: Bool) -> some View {
    switch entry {
    case let .comment(comment):
      IssueCommentCard(
        comment: comment,
        replies: repliesByParent[comment.id] ?? [],
        baseURL: viewModel.configuration.webBaseURL,
        members: viewModel.workspaceOptions?.members ?? [],
        replyDraft: Binding(
          get: { replyDrafts[comment.id, default: ""] },
          set: { replyDrafts[comment.id] = $0 }
        ),
        isReplying: activeReplyParentId == comment.id,
        isPostingReply: postingReplyParentId == comment.id,
        focusedField: $focusedField,
        formatCommand: replyFormatCommands[comment.id],
        onFormatStateChange: { state in
          replyFormatStates[comment.id] = state
        },
        onReplyTap: {
          withAnimation(.snappy(duration: 0.18)) {
            activeReplyParentId = comment.id
            focusedField = .replyComment(comment.id)
          }
        },
        onCancelReply: {
          withAnimation(.snappy(duration: 0.18)) {
            activeReplyParentId = nil
            replyDrafts[comment.id] = ""
          }
        },
        onSubmitReply: {
          postReply(parentId: comment.id)
        }
      )
    case let .activity(activity):
      IssueActivityTimelineRow(
        activity: activity,
        isLast: isLast
      )
    }
  }

  private func scrollToPendingTarget(with proxy: ScrollViewProxy) {
    guard let target = pendingScrollTarget, let entryID = resolvedTimelineEntryID(for: target) else {
      return
    }

    withAnimation(.snappy(duration: 0.25)) {
      proxy.scrollTo(entryID, anchor: .center)
      highlightedEntryID = entryID
    }
    pendingScrollTarget = nil

    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 1_600_000_000)
      if highlightedEntryID == entryID {
        highlightedEntryID = nil
      }
    }
  }

  private func resolvedTimelineEntryID(for target: IssueDetailScrollTarget) -> String? {
    if timelineEntryIDs.contains(target.entryID) {
      return target.entryID
    }

    if
      let commentID = target.commentID,
      let parentID = viewModel.comments.first(where: { $0.id == commentID })?.parentId
    {
      let parentEntryID = "comment:\(parentID)"
      if timelineEntryIDs.contains(parentEntryID) {
        return parentEntryID
      }
    }

    return nil
  }

  private func syncDraft(from issue: VectorIssueRow) {
    draftTitle = issue.title
    draftDescription = issue.description ?? ""
  }

  private func timelineSpacing(before index: Int) -> CGFloat {
    guard index > 0 else {
      return 0
    }

    if timelineEntries[index - 1].isComment && timelineEntries[index].isComment {
      return 0
    }

    return 12
  }

  private func saveDocumentChanges() {
    guard canEditIssue else {
      issueErrorMessage = "You do not have permission to edit this issue."
      return
    }

    guard !isSavingDocument else {
      return
    }

    let title = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty else {
      issueErrorMessage = "Title is required."
      return
    }

    isSavingDocument = true
    issueErrorMessage = nil
    Task { @MainActor in
      do {
        if title != displayIssue.title {
          try await viewModel.updateIssueTitle(issueId: displayIssue.id, title: title)
          draftTitle = title
        }
        if draftDescription != (displayIssue.description ?? "") {
          try await viewModel.updateIssueDescription(issueId: displayIssue.id, description: draftDescription)
        }
        isEditingDescription = false
        focusedField = nil
        isTitleFocused = false
      } catch {
        issueErrorMessage = error.localizedDescription
      }
      isSavingDocument = false
    }
  }

  private func postComment() {
    guard !isPostingComment else {
      return
    }

    let body = commentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else {
      return
    }

    isPostingComment = true
    issueErrorMessage = nil
    commentDraft = ""
    activeReplyParentId = nil
    focusedField = nil
    isTitleFocused = false
    Task { @MainActor in
      do {
        try await viewModel.addIssueComment(issueId: displayIssue.id, body: body)
      } catch {
        commentDraft = body
        issueErrorMessage = error.localizedDescription
      }
      isPostingComment = false
    }
  }

  private func postReply(parentId: VectorID) {
    guard postingReplyParentId == nil else {
      return
    }

    let body = replyDrafts[parentId, default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else {
      return
    }

    postingReplyParentId = parentId
    issueErrorMessage = nil
    replyDrafts[parentId] = ""
    activeReplyParentId = nil
    focusedField = nil
    isTitleFocused = false
    Task { @MainActor in
      do {
        try await viewModel.addIssueComment(issueId: displayIssue.id, body: body, parentId: parentId)
      } catch {
        replyDrafts[parentId] = body
        activeReplyParentId = parentId
        issueErrorMessage = error.localizedDescription
      }
      postingReplyParentId = nil
    }
  }

  private func runPropertyUpdate(_ property: IssueDetailProperty, operation: @escaping () async throws -> Void) {
    guard canEditIssue else {
      issueErrorMessage = "You do not have permission to edit this issue."
      return
    }

    guard pendingProperty == nil else {
      return
    }

    pendingProperty = property
    issueErrorMessage = nil
    Task { @MainActor in
      do {
        try await operation()
      } catch {
        issueErrorMessage = error.localizedDescription
      }
      pendingProperty = nil
    }
  }

  private func applyMarkdownFormatting(_ action: MarkdownFormatAction) {
    switch focusedField {
    case .description:
      descriptionFormatCommand = VectorRichTextCommand(action: action)
    case .mainComment:
      commentFormatCommand = VectorRichTextCommand(action: action)
    case let .replyComment(parentId):
      replyFormatCommands[parentId] = VectorRichTextCommand(action: action)
    case .title, nil:
      return
    }
  }
}

private enum IssueDetailFocusField: Hashable {
  case title
  case description
  case mainComment
  case replyComment(VectorID)

  var showsMarkdownToolbar: Bool {
    switch self {
    case .description, .mainComment, .replyComment:
      true
    case .title:
      false
    }
  }
}

private enum IssueDetailProperty: Hashable {
  case status
  case priority
  case assignees
  case project
  case team
  case visibility
}

private enum IssueTimelineEntry: Identifiable {
  case comment(VectorComment)
  case activity(VectorActivityItem)

  var id: String {
    switch self {
    case let .comment(comment):
      "comment:\(comment.id)"
    case let .activity(activity):
      "activity:\(activity.id)"
    }
  }

  var createdAt: Double {
    switch self {
    case let .comment(comment):
      comment.creationTime
    case let .activity(activity):
      activity.createdAt
    }
  }

  var isComment: Bool {
    if case .comment = self {
      return true
    }
    return false
  }
}

enum MarkdownFormatAction: String, CaseIterable, Identifiable {
  case bold
  case italic
  case heading
  case bullet
  case code
  case quote
  case link

  var id: String { rawValue }

  var systemImage: String {
    switch self {
    case .bold: "bold"
    case .italic: "italic"
    case .heading: "textformat.size"
    case .bullet: "list.bullet"
    case .code: "chevron.left.forwardslash.chevron.right"
    case .quote: "quote.opening"
    case .link: "link"
    }
  }

  var accessibilityLabel: String {
    switch self {
    case .bold: "Bold"
    case .italic: "Italic"
    case .heading: "Heading"
    case .bullet: "Bullet list"
    case .code: "Inline code"
    case .quote: "Quote"
    case .link: "Link"
    }
  }

  func apply(to text: String) -> String {
    switch self {
    case .bold:
      appendInline("**bold**", to: text)
    case .italic:
      appendInline("_italic_", to: text)
    case .heading:
      appendLine("## Heading", to: text)
    case .bullet:
      appendLine("- ", to: text)
    case .code:
      appendInline("`code`", to: text)
    case .quote:
      appendLine("> ", to: text)
    case .link:
      appendInline("[link](https://)", to: text)
    }
  }

  private func appendInline(_ snippet: String, to text: String) -> String {
    if text.isEmpty || text.hasSuffix(" ") || text.hasSuffix("\n") {
      return text + snippet
    }
    return text + " " + snippet
  }

  private func appendLine(_ snippet: String, to text: String) -> String {
    if text.isEmpty || text.hasSuffix("\n") {
      return text + snippet
    }
    return text + "\n" + snippet
  }
}

private enum IssueVisibilityOption: String, CaseIterable, Identifiable {
  case privateVisibility = "private"
  case organization
  case publicVisibility = "public"

  var id: String { rawValue }

  var label: String {
    switch self {
    case .privateVisibility: "Private"
    case .organization: "Organization"
    case .publicVisibility: "Public"
    }
  }

  var systemImage: String {
    switch self {
    case .privateVisibility: "lock"
    case .organization: "building.2"
    case .publicVisibility: "globe"
    }
  }
}

private struct IssuePropertyBar: View {
  let issue: VectorIssueRow
  let options: VectorWorkspaceOptions?
  let selectedAssigneeIds: Set<VectorID>
  let pendingProperty: IssueDetailProperty?
  let isEditable: Bool
  let onStateSelect: (VectorState) -> Void
  let onPrioritySelect: (VectorPriority) -> Void
  let onAssigneesSelect: ([VectorID]) -> Void
  let onProjectSelect: (VectorProject?) -> Void
  let onTeamSelect: (VectorTeam?) -> Void
  let onVisibilitySelect: (IssueVisibilityOption) -> Void

  private var currentVisibility: IssueVisibilityOption {
    IssueVisibilityOption(rawValue: issue.visibility ?? "organization") ?? .organization
  }

  private var isStatusDisabled: Bool {
    !isEditable || (options?.issueStates.isEmpty ?? true) || pendingProperty != nil
  }

  private var isPriorityDisabled: Bool {
    !isEditable || (options?.issuePriorities.isEmpty ?? true) || pendingProperty != nil
  }

  private var isAssigneeDisabled: Bool {
    !isEditable || (options?.members.isEmpty ?? true) || pendingProperty != nil
  }

  private var status: VectorIssueMetadataValue {
    VectorIssueMetadataResolver.state(for: issue, options: options)
  }

  private var priority: VectorIssueMetadataValue? {
    VectorIssueMetadataResolver.priority(for: issue, options: options)
  }

  private var statusText: String {
    status.name
  }

  private var statusColor: Color {
    Color(vectorHex: status.color)
  }

  private var statusSystemImage: String {
    vectorSystemImage(for: status.icon)
  }

  private var priorityText: String {
    priority?.name ?? "Priority"
  }

  private var priorityColor: Color {
    Color(vectorHex: priority?.color)
  }

  private var prioritySystemImage: String {
    vectorSystemImage(for: priority?.icon)
  }

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        Menu {
          ForEach((options?.issueStates ?? []).sorted { $0.position < $1.position }) { state in
            Button {
              onStateSelect(state)
            } label: {
              Label(state.name, systemImage: issue.workflowStateId == state.id ? "checkmark" : vectorSystemImage(for: state.icon))
            }
          }
        } label: {
          IssuePropertyPill(
            text: statusText,
            color: statusColor,
            systemImage: statusSystemImage,
            isPending: pendingProperty == .status
          )
        }
        .disabled(isStatusDisabled)

        Menu {
          ForEach((options?.issuePriorities ?? []).sorted { $0.weight > $1.weight }) { priority in
            Button {
              onPrioritySelect(priority)
            } label: {
              Label(priority.name, systemImage: issue.priorityId == priority.id ? "checkmark" : vectorSystemImage(for: priority.icon))
            }
          }
        } label: {
          IssuePropertyPill(
            text: priorityText,
            color: priorityColor,
            systemImage: prioritySystemImage,
            isPending: pendingProperty == .priority
          )
        }
        .disabled(isPriorityDisabled)

        IssueAssigneeMenu(
          members: options?.members ?? [],
          selectedAssigneeIds: selectedAssigneeIds,
          isPending: pendingProperty == .assignees,
          onSelect: onAssigneesSelect
        )
        .disabled(isAssigneeDisabled)

        Menu {
          Button {
            onProjectSelect(nil)
          } label: {
            Label("No project", systemImage: issue.projectId == nil ? "checkmark" : "folder")
          }
          ForEach(options?.projects ?? []) { project in
            Button {
              onProjectSelect(project)
            } label: {
              Label(project.name, systemImage: issue.projectId == project.id ? "checkmark" : vectorSystemImage(for: project.icon))
            }
          }
        } label: {
          IssuePropertyPill(
            text: issue.projectKey ?? "No project",
            color: Color.secondary,
            systemImage: "folder",
            isPending: pendingProperty == .project
          )
        }
        .disabled(!isEditable || options == nil || pendingProperty != nil)

        Menu {
          Button {
            onTeamSelect(nil)
          } label: {
            Label("No team", systemImage: issue.teamId == nil ? "checkmark" : "person.3")
          }
          ForEach(options?.teams ?? []) { team in
            Button {
              onTeamSelect(team)
            } label: {
              Label(team.name, systemImage: issue.teamId == team.id ? "checkmark" : vectorSystemImage(for: team.icon))
            }
          }
        } label: {
          IssuePropertyPill(
            text: issue.teamKey ?? "No team",
            color: Color.secondary,
            systemImage: "person.3",
            isPending: pendingProperty == .team
          )
        }
        .disabled(!isEditable || options == nil || pendingProperty != nil)

        Menu {
          ForEach(IssueVisibilityOption.allCases) { visibility in
            Button {
              onVisibilitySelect(visibility)
            } label: {
              Label(visibility.label, systemImage: currentVisibility == visibility ? "checkmark" : visibility.systemImage)
            }
          }
        } label: {
          IssuePropertyPill(
            text: currentVisibility.label,
            color: Color.secondary,
            systemImage: currentVisibility.systemImage,
            isPending: pendingProperty == .visibility
          )
        }
        .disabled(!isEditable || pendingProperty != nil)
      }
      .padding(.horizontal, 22)
      .padding(.vertical, 2)
    }
    #if os(iOS)
    .scrollClipDisabled()
    #endif
  }
}

private struct IssuePropertyPill: View {
  let text: String
  var color: Color
  var systemImage: String
  var isPending: Bool

  var body: some View {
    HStack(spacing: 5) {
      if isPending {
        ProgressView()
          .controlSize(.small)
      } else {
        Image(systemName: systemImage)
          .font(.caption2.weight(.semibold))
      }
      Text(text)
        .lineLimit(1)
      Image(systemName: "chevron.down")
        .font(.caption2.weight(.bold))
        .foregroundStyle(.secondary)
    }
    .font(.caption.weight(.medium))
    .foregroundStyle(color)
    .padding(.horizontal, 9)
    .frame(height: 30)
    .background(color.opacity(0.10), in: Capsule())
  }
}

private struct IssueAssigneeMenu: View {
  let members: [VectorWorkspaceMember]
  let selectedAssigneeIds: Set<VectorID>
  let isPending: Bool
  let onSelect: ([VectorID]) -> Void

  private var label: String {
    if selectedAssigneeIds.isEmpty {
      return "Unassigned"
    }
    if selectedAssigneeIds.count == 1,
      let selectedId = selectedAssigneeIds.first,
      let member = members.first(where: { $0.userId == selectedId })
    {
      return member.displayName
    }
    return "\(selectedAssigneeIds.count) assignees"
  }

  var body: some View {
    Menu {
      Button {
        onSelect([])
      } label: {
        Label("Unassigned", systemImage: selectedAssigneeIds.isEmpty ? "checkmark" : "person.slash")
      }

      ForEach(members.filter { $0.userId != nil }) { member in
        let userId = member.userId ?? member.id
        Button {
          var next = selectedAssigneeIds
          if next.contains(userId) {
            next.remove(userId)
          } else {
            next.insert(userId)
          }
          onSelect(Array(next))
        } label: {
          Label(member.displayName, systemImage: selectedAssigneeIds.contains(userId) ? "checkmark" : "person")
        }
      }
    } label: {
      IssuePropertyPill(
        text: label,
        color: Color.secondary,
        systemImage: "person.crop.circle",
        isPending: isPending
      )
    }
  }
}

private struct IssueCommentComposer: View {
  @Binding var text: String
  let isPosting: Bool
  var placeholder = "Write a comment"
  var minHeight: CGFloat = 76
  var members: [VectorWorkspaceMember] = []
  var baseURL: URL?
  let focusTarget: IssueDetailFocusField
  let focusedField: Binding<IssueDetailFocusField?>
  var formatCommand: VectorRichTextCommand?
  var onFormatStateChange: (VectorRichTextFormatState) -> Void = { _ in }
  let onSubmit: () -> Void

  private var hasText: Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var canSubmit: Bool {
    hasText && !isPosting
  }

  private var sendButtonIsActive: Bool {
    hasText || isPosting
  }

  private var mentionQuery: String? {
    guard focusedField.wrappedValue == focusTarget else {
      return nil
    }

    guard let atIndex = currentMentionStartIndex() else {
      return nil
    }

    let query = text[text.index(after: atIndex)...]
    guard query.allSatisfy({ character in isMentionCharacter(character) }) else {
      return nil
    }
    return String(query).lowercased()
  }

  private var mentionSuggestions: [VectorWorkspaceMember] {
    guard let mentionQuery else {
      return []
    }

    return members
      .filter { member in
        let haystack = [
          member.displayName,
          member.email ?? "",
          mentionHandle(for: member),
        ]
        .joined(separator: " ")
        .lowercased()
        return mentionQuery.isEmpty || haystack.contains(mentionQuery)
      }
      .prefix(6)
      .map { $0 }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if !mentionSuggestions.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(mentionSuggestions) { member in
              Button {
                insertMention(member)
              } label: {
                HStack(spacing: 6) {
                  VectorUserAvatar(user: member.user, baseURL: baseURL, size: 20)
                  Text(member.displayName)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                }
                .padding(.leading, 5)
                .padding(.trailing, 10)
                .frame(height: 30)
                .background(VectorTheme.groupedBackground, in: Capsule())
                .vectorShadowRing(cornerRadius: 15)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(.horizontal, 1)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
      }

      VStack(alignment: .leading, spacing: 8) {
        ZStack(alignment: .topLeading) {
          Text(placeholder)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 1 : 0)
            .allowsHitTesting(false)

          VectorRichTextEditor(
            text: $text,
            minHeight: minHeight,
            fontSize: 15,
            formatCommand: formatCommand,
            isFocused: focusedField.wrappedValue == focusTarget,
            onFocusChange: { isFocused in
              focusedField.wrappedValue = isFocused ? focusTarget : nil
            },
            onFormatStateChange: onFormatStateChange
          )
          .padding(.horizontal, 3)
          .padding(.vertical, 1)
        }

        HStack(alignment: .center, spacing: 8) {
          Text("Use @ to mention")
            .font(.caption)
            .foregroundStyle(.secondary)
            .opacity(text.contains("@") ? 0 : 1)

          Spacer(minLength: 8)

          Button(action: onSubmit) {
            ZStack {
              if isPosting {
                ProgressView()
                  .controlSize(.small)
                  .tint(.white)
              } else {
                Image(systemName: "arrow.up")
                  .font(.caption.weight(.bold))
              }
            }
            .frame(width: 30, height: 30)
            .foregroundStyle(sendButtonIsActive ? Color.white : Color.secondary)
            .background(
              sendButtonIsActive ? VectorTheme.accent : Color.secondary.opacity(0.12),
              in: Circle()
            )
          }
          .buttonStyle(.plain)
          .disabled(!canSubmit)
          .accessibilityLabel("Comment")
        }
      }
      .padding(.horizontal, 10)
      .padding(.top, 8)
      .padding(.bottom, 8)
      .background(VectorTheme.inputBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      .vectorShadowRing(cornerRadius: 12)
    }
  }

  private func insertMention(_ member: VectorWorkspaceMember) {
    let replacement = "@\(mentionHandle(for: member)) "
    guard let atIndex = currentMentionStartIndex() else {
      text += replacement
      return
    }

    text.removeSubrange(atIndex..<text.endIndex)
    text += replacement
  }

  private func currentMentionStartIndex() -> String.Index? {
    var index = text.endIndex
    while index > text.startIndex {
      let previous = text.index(before: index)
      let character = text[previous]
      if character == "@" {
        return previous
      }
      if character.isWhitespace || character == "\n" {
        return nil
      }
      if !isMentionCharacter(character) {
        return nil
      }
      index = previous
    }
    return nil
  }

  private func isMentionCharacter(_ character: Character) -> Bool {
    guard character.unicodeScalars.allSatisfy(\.isASCII) else {
      return false
    }
    return character.isLetter || character.isNumber || character == "." || character == "_" || character == "-"
  }

  private func mentionHandle(for member: VectorWorkspaceMember) -> String {
    if let emailPrefix = member.email?.split(separator: "@").first, !emailPrefix.isEmpty {
      return String(emailPrefix).lowercased()
    }

    let normalized = member.displayName
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: #"\s+"#, with: "-", options: .regularExpression)
      .filter { isMentionCharacter($0) }
    return normalized.isEmpty ? "user" : String(normalized)
  }
}

private struct MarkdownFormattingKeyboardToolbar: View {
  var formatState = VectorRichTextFormatState()
  let onAction: (MarkdownFormatAction) -> Void
  let onDismiss: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      ForEach(MarkdownFormatAction.allCases) { action in
        let isActive = formatState.isActive(action)
        Button {
          onAction(action)
        } label: {
          Image(systemName: action.systemImage)
            .font(.system(size: 15, weight: .semibold))
            .frame(width: 30, height: 30)
            .foregroundStyle(isActive ? Color.white : Color.secondary)
            .background(isActive ? VectorTheme.accent : Color.clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.accessibilityLabel)
      }

      Spacer(minLength: 8)

      Button {
        onDismiss()
      } label: {
        Image(systemName: "keyboard.chevron.compact.down")
          .font(.system(size: 15, weight: .semibold))
          .frame(width: 34, height: 30)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Dismiss keyboard")
    }
  }
}

private func relativeTimestamp(_ milliseconds: Double) -> String {
  let date = Date(timeIntervalSince1970: milliseconds / 1000)
  let seconds = max(0, Int(Date().timeIntervalSince(date)))

  if seconds < 60 {
    return "just now"
  }

  let minutes = seconds / 60
  if minutes < 60 {
    return "\(minutes) minute\(minutes == 1 ? "" : "s") ago"
  }

  let hours = minutes / 60
  if hours < 24 {
    return "\(hours) hour\(hours == 1 ? "" : "s") ago"
  }

  let days = hours / 24
  if days < 7 {
    return "\(days) day\(days == 1 ? "" : "s") ago"
  }

  return date.formatted(date: .abbreviated, time: .omitted)
}

private struct IssueActivityTimelineRow: View {
  let activity: VectorActivityItem
  let isLast: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack(alignment: .top) {
        if !isLast {
          Rectangle()
            .fill(VectorTheme.border.opacity(0.35))
            .frame(width: 1)
            .offset(y: 22)
        }
        Image(systemName: systemImage)
          .font(.caption2.weight(.semibold))
          .symbolRenderingMode(.monochrome)
          .foregroundStyle(iconColor)
          .frame(width: 18, height: 18)
          .background(VectorTheme.rowBackground, in: Circle())
          .overlay(
            Circle()
              .stroke(VectorTheme.border.opacity(0.55), lineWidth: 0.8)
          )
      }
      .frame(width: 28, alignment: .top)
      .frame(minHeight: 30, alignment: .top)

      HStack(alignment: .firstTextBaseline, spacing: 4) {
        activityText
          .font(.subheadline)
          .foregroundStyle(.primary)
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 12)
        Text(relativeTimestamp(activity.createdAt))
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 5)
  }

  private var actorName: String {
    activity.actor?.displayName ?? "Someone"
  }

	  private var activityText: Text {
	    Text("\(Text(actorName).fontWeight(.semibold)) \(description)")
  }

  private var description: String {
    switch activity.eventType {
    case "issue_created":
      "created this issue"
    case "issue_title_changed":
      "updated the title"
    case "issue_description_changed":
      "updated the description"
    case "issue_workflow_state_changed":
      "changed the status"
    case "issue_priority_changed":
      "changed the priority"
    case "issue_assignees_changed":
      assignmentDescription
    case "issue_project_changed":
      "changed the project"
    case "issue_team_changed":
      "changed the team"
    case "issue_visibility_changed":
      "changed visibility"
    case "issue_comment_added":
      "commented"
    default:
      "updated the issue"
    }
  }

  private var assignmentDescription: String {
    if !activity.details.addedUserNames.isEmpty {
      return "assigned \(activity.details.addedUserNames.joined(separator: ", "))"
    }
    if !activity.details.removedUserNames.isEmpty {
      return "unassigned \(activity.details.removedUserNames.joined(separator: ", "))"
    }
    return "changed assignees"
  }

  private var systemImage: String {
    switch activity.eventType {
    case "issue_created":
      "plus"
    case "issue_comment_added":
      "text.bubble"
    case "issue_assignees_changed":
      "person.2"
    case "issue_workflow_state_changed", "issue_assignment_state_changed":
      "circle.circle"
    case "issue_title_changed", "issue_description_changed":
      "textformat"
    case "issue_priority_changed":
      "arrow.left.arrow.right"
    case "issue_project_changed", "issue_project_added", "issue_project_removed":
      "folder"
    case "issue_team_changed", "issue_team_added", "issue_team_removed":
      "person.2"
    case "issue_visibility_changed":
      "eye"
    case "issue_sub_issue_created",
      "issue_github_artifact_linked",
      "issue_github_artifact_unlinked",
      "issue_github_artifact_suppressed",
      "issue_github_artifact_status_changed":
      "point.3.connected.trianglepath.dotted"
    case "issue_live_activity_started",
      "issue_live_activity_delegated",
      "issue_live_activity_completed",
      "issue_live_activity_status_changed":
      "terminal"
    default:
      "doc.text"
    }
  }

  private var iconColor: Color {
    switch activity.eventType {
    case "issue_created", "issue_sub_issue_created":
      Color(vectorHex: "#8b5cf6")
    case "issue_workflow_state_changed",
      "issue_assignment_state_changed",
      "issue_live_activity_started",
      "issue_live_activity_delegated":
      Color(vectorHex: "#22c55e")
    case "issue_priority_changed":
      Color(vectorHex: "#f97316")
    case "issue_assignees_changed", "issue_comment_added":
      Color(vectorHex: "#3b82f6")
    case "issue_team_changed",
      "issue_team_added",
      "issue_team_removed",
      "issue_project_changed",
      "issue_project_added",
      "issue_project_removed",
      "issue_visibility_changed",
      "issue_title_changed",
      "issue_description_changed",
      "issue_github_artifact_linked",
      "issue_github_artifact_unlinked",
      "issue_github_artifact_suppressed",
      "issue_github_artifact_status_changed",
      "issue_live_activity_completed",
      "issue_live_activity_status_changed":
      Color.secondary
    default:
      Color.secondary
    }
  }
}

private struct IssueCommentCard: View {
  let comment: VectorComment
  let replies: [VectorComment]
  let baseURL: URL
  let members: [VectorWorkspaceMember]
  @Binding var replyDraft: String
  let isReplying: Bool
  let isPostingReply: Bool
  let focusedField: Binding<IssueDetailFocusField?>
  let formatCommand: VectorRichTextCommand?
  let onFormatStateChange: (VectorRichTextFormatState) -> Void
  let onReplyTap: () -> Void
  let onCancelReply: () -> Void
  let onSubmitReply: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      commentContent(comment, compact: false, showsReplyAction: true)
        .padding(.vertical, 10)

      ForEach(replies) { reply in
        commentContent(reply, compact: true)
          .padding(.leading, 36)
          .padding(.top, 2)
          .padding(.bottom, 8)
      }

      if isReplying {
        VStack(alignment: .leading, spacing: 8) {
          IssueCommentComposer(
            text: $replyDraft,
            isPosting: isPostingReply,
            placeholder: "Leave a reply... Use @ to mention",
            minHeight: 46,
            members: members,
            baseURL: baseURL,
            focusTarget: .replyComment(comment.id),
            focusedField: focusedField,
            formatCommand: formatCommand,
            onFormatStateChange: onFormatStateChange,
            onSubmit: onSubmitReply
          )
        }
        .padding(.top, 6)
        .padding(.leading, 36)
        .padding(.bottom, 8)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func commentContent(_ comment: VectorComment, compact: Bool, showsReplyAction: Bool = false) -> some View {
    HStack(alignment: .top, spacing: 10) {
      VectorUserAvatar(user: comment.author, baseURL: baseURL, size: compact ? 22 : 28)

      VStack(alignment: .leading, spacing: compact ? 5 : 7) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(comment.author?.displayName ?? "Unknown user")
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
          Text(relativeTimestamp(comment.creationTime))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
          Spacer(minLength: 8)
          if showsReplyAction {
            Button {
              if isReplying {
                onCancelReply()
              } else {
                onReplyTap()
              }
            } label: {
              Text(isReplying ? "Cancel" : "Reply")
                .font(.caption.weight(.semibold))
                .foregroundStyle(VectorTheme.accent)
                .frame(height: 24)
            }
            .buttonStyle(.plain)
            .disabled(isPostingReply)
          }
        }

        MarkdownDocumentView(markdown: comment.body)
          .font(compact ? .subheadline : .body)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct VectorUserAvatar: View {
  let user: VectorUser?
  let baseURL: URL?
  var size: CGFloat = 26

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      avatar
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
          Circle()
            .stroke(statusRingColor, lineWidth: status == nil ? 0.5 : max(1.2, size * 0.06))
        )

      if let status {
        Circle()
          .fill(Color(vectorHex: status.presence.colorHex))
          .frame(width: max(7, size * 0.30), height: max(7, size * 0.30))
          .overlay(Circle().stroke(VectorTheme.rowBackground, lineWidth: max(1.5, size * 0.08)))
          .offset(x: max(1, size * 0.06), y: max(1, size * 0.06))
      }
    }
    .frame(width: size, height: size)
  }

  @ViewBuilder private var avatar: some View {
    if let url = imageURL {
      AsyncImage(url: url) { phase in
        switch phase {
        case let .success(image):
          image
            .resizable()
            .scaledToFill()
        default:
          fallback
        }
      }
    } else {
      fallback
    }
  }

  private var status: VectorUserStatus? {
    user?.status
  }

  private var statusRingColor: Color {
    if let status {
      return Color(vectorHex: status.presence.colorHex).opacity(0.68)
    }
    return VectorTheme.border.opacity(0.25)
  }

  private var imageURL: URL? {
    guard let rawImage = user?.image?.trimmingCharacters(in: .whitespacesAndNewlines), !rawImage.isEmpty else {
      return nil
    }

    if rawImage.hasPrefix("//") {
      return URL(string: "https:\(rawImage)")
    }

    if let absoluteURL = URL(string: rawImage), absoluteURL.scheme != nil {
      return absoluteURL
    }

    if let baseURL {
      return URL(string: rawImage, relativeTo: baseURL)?.absoluteURL
    }

    return URL(string: rawImage)
  }

  private var fallback: some View {
    Circle()
      .fill(VectorTheme.accent.opacity(0.14))
      .overlay(
        Text(initials)
          .font(.system(size: max(10, size * 0.38), weight: .semibold))
          .foregroundStyle(VectorTheme.accent)
      )
  }

  private var initials: String {
    let source = user?.displayName.trimmingCharacters(in: .whitespacesAndNewlines) ?? "?"
    let parts = source.split(separator: " ")
    let value = parts.prefix(2).compactMap { $0.first }.map(String.init).joined()
    return value.isEmpty ? "?" : value.uppercased()
  }
}

private struct DocumentSection<Content: View>: View {
  let title: String
  @ViewBuilder var content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .textCase(.uppercase)
      VStack(alignment: .leading, spacing: 12) {
        content
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct MarkdownDocumentView: View {
  let markdown: String

  private var blocks: [VectorMarkdownBlock] {
    VectorMarkdownParser.parse(markdown)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        MarkdownBlockView(block: block)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct MarkdownBlockView: View {
  let block: VectorMarkdownBlock

  var body: some View {
    switch block {
    case let .heading(level, text):
      InlineMarkdownText(text: text)
        .font(headingFont(for: level))
        .foregroundStyle(.primary)
        .padding(.top, level <= 2 ? 6 : 2)
    case let .paragraph(text):
      InlineMarkdownText(text: text)
        .font(.body)
        .foregroundStyle(.primary.opacity(0.72))
        .lineSpacing(4)
    case let .unorderedList(items):
      VStack(alignment: .leading, spacing: 7) {
        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
          HStack(alignment: .top, spacing: 8) {
            Circle()
              .fill(Color.secondary)
              .frame(width: 4, height: 4)
              .padding(.top, 9)
            InlineMarkdownText(text: item)
              .font(.body)
              .foregroundStyle(.primary.opacity(0.72))
          }
        }
      }
    case let .orderedList(items):
      VStack(alignment: .leading, spacing: 7) {
        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(index + 1).")
              .font(.body.monospacedDigit())
              .foregroundStyle(.secondary)
              .frame(width: 24, alignment: .trailing)
            InlineMarkdownText(text: item)
              .font(.body)
              .foregroundStyle(.primary.opacity(0.72))
          }
        }
      }
    case let .codeBlock(code):
      ScrollView(.horizontal, showsIndicators: false) {
        Text(code)
          .font(.system(.footnote, design: .monospaced))
          .foregroundStyle(.primary)
          .padding(10)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(VectorTheme.groupedBackground, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    case let .quote(text):
      HStack(alignment: .top, spacing: 10) {
        Rectangle()
          .fill(Color.secondary.opacity(0.28))
          .frame(width: 3)
        InlineMarkdownText(text: text)
          .font(.body)
          .foregroundStyle(.secondary)
          .lineSpacing(4)
      }
    case .horizontalRule:
      Divider()
        .padding(.vertical, 4)
    }
  }

  private func headingFont(for level: Int) -> Font {
    switch level {
    case 1:
      .title2.weight(.semibold)
    case 2:
      .title3.weight(.semibold)
    case 3:
      .headline.weight(.semibold)
    default:
      .subheadline.weight(.semibold)
    }
  }
}

private struct InlineMarkdownText: View {
  let text: String

  var body: some View {
    Text(attributedText)
      .fixedSize(horizontal: false, vertical: true)
  }

  private var attributedText: AttributedString {
    (
      try? AttributedString(
        markdown: text,
        options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
      )
    ) ?? AttributedString(text)
  }
}

private enum WorkspaceSection: String, CaseIterable, Identifiable {
  case teams
  case projects
  case docs

  var id: String { rawValue }

  var label: String {
    switch self {
    case .teams: "Teams"
    case .projects: "Projects"
    case .docs: "Docs"
    }
  }

  var searchPrompt: String {
    switch self {
    case .teams: "Search teams"
    case .projects: "Search projects"
    case .docs: "Search docs"
    }
  }
}

struct WorkspaceScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var section: WorkspaceSection = .teams
  @State private var searchText = ""
  @State private var isSearchPresented = false
  @FocusState private var isSearchFocused: Bool

  private var filteredTeams: [VectorTeam] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return viewModel.teams }
    return viewModel.teams.filter {
      $0.name.localizedCaseInsensitiveContains(query)
        || $0.key.localizedCaseInsensitiveContains(query)
        || ($0.description?.localizedCaseInsensitiveContains(query) ?? false)
    }
  }

  private var filteredProjects: [VectorProject] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return viewModel.projects }
    return viewModel.projects.filter {
      $0.name.localizedCaseInsensitiveContains(query)
        || $0.key.localizedCaseInsensitiveContains(query)
        || ($0.description?.localizedCaseInsensitiveContains(query) ?? false)
    }
  }

  private var filteredDocuments: [VectorDocument] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return viewModel.documents }
    return viewModel.documents.filter {
      $0.title.localizedCaseInsensitiveContains(query)
        || ($0.content?.localizedCaseInsensitiveContains(query) ?? false)
        || ($0.team?.name.localizedCaseInsensitiveContains(query) ?? false)
        || ($0.project?.name.localizedCaseInsensitiveContains(query) ?? false)
    }
  }

  private var isSearchActive: Bool {
    !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 8) {
        if isSearchPresented || !searchText.isEmpty {
          HStack(spacing: 8) {
            TextField(section.searchPrompt, text: $searchText)
              .textFieldStyle(.roundedBorder)
              .focused($isSearchFocused)
              .submitLabel(.search)
            Button("Cancel") {
              withAnimation(.snappy(duration: 0.18)) {
                searchText = ""
                isSearchPresented = false
                isSearchFocused = false
              }
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.plain)
            .foregroundStyle(VectorTheme.accent)
          }
          .transition(.move(edge: .top).combined(with: .opacity))
        }

        CompactSegmentedControl(options: WorkspaceSection.allCases, selection: $section) { $0.label }
      }
      .padding(12)

      content
    }
    .background(VectorTheme.rowBackground)
    .navigationTitle("Workspace")
    .vectorInlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button {
          withAnimation(.snappy(duration: 0.18)) {
            isSearchPresented.toggle()
            if !isSearchPresented {
              isSearchFocused = false
            }
          }
        } label: {
          Image(systemName: isSearchPresented ? "xmark" : "magnifyingglass")
        }
        .accessibilityLabel(isSearchPresented ? "Hide search" : "Search workspace")
      }
    }
    .onChange(of: section) {
      searchText = ""
      if isSearchPresented {
        Task { @MainActor in
          try? await Task.sleep(nanoseconds: 80_000_000)
          isSearchFocused = true
        }
      }
    }
    .onChange(of: isSearchPresented) { _, presented in
      if presented {
        Task { @MainActor in
          try? await Task.sleep(nanoseconds: 120_000_000)
          isSearchFocused = true
        }
      }
    }
    .onAppear {
      viewModel.loadWorkspaceContent()
    }
  }

  @ViewBuilder private var content: some View {
    switch section {
    case .teams:
      if filteredTeams.isEmpty {
        VectorEmptyState(
          title: searchText.isEmpty ? "No teams" : "No matching teams",
          systemImage: "person.2",
          message: searchText.isEmpty ? "Teams from this workspace will appear here." : "Try a different team name or key."
        )
      } else {
        WorkspaceScrollList {
          ForEach(filteredTeams) { team in
            NavigationLink {
              TeamDetailScreen(team: team, viewModel: viewModel)
            } label: {
              TeamRow(team: team)
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider().padding(.leading, 48)
          }

          PagingTrigger(
            canLoadMore: !isSearchActive && viewModel.canLoadMoreTeams,
            isLoading: !isSearchActive && viewModel.isLoadingMoreTeams,
            action: viewModel.loadMoreTeams
          )
        }
      }
    case .projects:
      if filteredProjects.isEmpty {
        VectorEmptyState(
          title: searchText.isEmpty ? "No projects" : "No matching projects",
          systemImage: "folder",
          message: searchText.isEmpty ? "Projects from this workspace will appear here." : "Try a different project name or key."
        )
      } else {
        WorkspaceScrollList {
          ForEach(filteredProjects) { project in
            NavigationLink {
              ProjectDetailScreen(project: project, viewModel: viewModel)
            } label: {
              ProjectRow(project: project)
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider().padding(.leading, 48)
          }

          PagingTrigger(
            canLoadMore: !isSearchActive && viewModel.canLoadMoreProjects,
            isLoading: !isSearchActive && viewModel.isLoadingMoreProjects,
            action: viewModel.loadMoreProjects
          )
        }
      }
    case .docs:
      if viewModel.isLoadingDocuments && filteredDocuments.isEmpty {
        SkeletonIssueList()
      } else if let error = viewModel.documentListError, filteredDocuments.isEmpty {
        VStack(spacing: 12) {
          VectorEmptyState(
            title: "Could not load docs",
            systemImage: "exclamationmark.triangle",
            message: error
          )
          Button("Try again") {
            viewModel.loadWorkspaceContent()
          }
          .buttonStyle(.bordered)
        }
      } else if filteredDocuments.isEmpty {
        VectorEmptyState(
          title: searchText.isEmpty ? "No docs" : "No matching docs",
          systemImage: "doc.text",
          message: searchText.isEmpty ? "Workspace documents will appear here." : "Try a different document title."
        )
      } else {
        WorkspaceScrollList {
          ForEach(filteredDocuments) { document in
            NavigationLink {
              DocumentDetailScreen(document: document, viewModel: viewModel)
            } label: {
              DocumentRow(document: document)
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Divider().padding(.leading, 48)
          }

          PagingTrigger(
            canLoadMore: !isSearchActive && viewModel.canLoadMoreDocuments,
            isLoading: !isSearchActive && viewModel.isLoadingMoreDocuments,
            action: viewModel.loadMoreDocuments
          )
        }
      }
    }
  }
}

private struct WorkspaceScrollList<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 0) {
        content
      }
    }
    .background(VectorTheme.rowBackground)
  }
}

struct ProjectRow: View {
  let project: VectorProject

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: vectorSystemImage(for: project.icon))
        .foregroundStyle(Color(vectorHex: project.color))
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 3) {
        Text(project.name)
          .font(.subheadline.weight(.medium))
        Text(project.key)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
      }
      Spacer()
      if let status = project.status {
        VectorPill(text: status.name, color: Color(vectorHex: status.color), systemImage: vectorSystemImage(for: status.icon))
      }
    }
    .padding(.vertical, 4)
  }
}

struct DocumentRow: View {
  let document: VectorDocument

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: vectorSystemImage(for: document.icon))
        .foregroundStyle(Color(vectorHex: document.color))
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 3) {
        Text(document.title)
          .font(.subheadline.weight(.medium))
          .lineLimit(1)
        HStack(spacing: 5) {
          if let project = document.project {
            Text(project.key)
          } else if let team = document.team {
            Text(team.key)
          } else {
            Text("DOC")
          }
          Text("Updated \(relativeTimestamp(document.updatedAt))")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
      }
      Spacer()
      Image(systemName: "chevron.right")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

struct DocumentDetailScreen: View {
  let document: VectorDocument
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var draftTitle = ""
  @State private var draftContent = ""
  @State private var isEditingContent = false
  @State private var isSaving = false
  @State private var documentErrorMessage: String?
  @State private var contentFormatCommand: VectorRichTextCommand?
  @State private var contentFormatState = VectorRichTextFormatState()
  @State private var focusedField: DocumentDetailFocusField?
  @FocusState private var isTitleFocused: Bool

  private var displayDocument: VectorDocument {
    if let selectedDocument = viewModel.selectedDocument, selectedDocument.id == document.id {
      return selectedDocument
    }
    return viewModel.documents.first { $0.id == document.id } ?? document
  }

  private var normalizedContent: String {
    VectorDocumentContentNormalizer.plainText(from: displayDocument.content ?? "")
  }

  private var isLargeDocument: Bool {
    displayDocument.contentVersion != nil
  }

  private var isWaitingForContent: Bool {
    isLargeDocument && displayDocument.content == nil && viewModel.documentContentError == nil
  }

  private var hasChanges: Bool {
    draftTitle.trimmingCharacters(in: .whitespacesAndNewlines) != displayDocument.title
      || draftContent != normalizedContent
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 10) {
          Image(systemName: vectorSystemImage(for: displayDocument.icon))
            .font(.system(size: 28, weight: .semibold))
            .foregroundStyle(Color(vectorHex: displayDocument.color))
            .frame(width: 44, height: 44)
            .background(Color(vectorHex: displayDocument.color).opacity(0.12), in: Circle())

          if isLargeDocument {
            Text(displayDocument.title)
              .font(.system(size: 30, weight: .semibold))
              .textSelection(.enabled)
          } else {
            TextField("Document title", text: $draftTitle, axis: .vertical)
              .font(.system(size: 30, weight: .semibold))
              .textFieldStyle(.plain)
              .focused($isTitleFocused)
              .submitLabel(.done)
              .onSubmit(saveChanges)
              .onChange(of: isTitleFocused) { _, isFocused in
                if isFocused {
                  focusedField = .title
                } else if focusedField == .title {
                  focusedField = nil
                }
              }
          }

          HStack(spacing: 8) {
            if let project = displayDocument.project {
              Label(project.key, systemImage: vectorSystemImage(for: project.icon))
            } else if let team = displayDocument.team {
              Label(team.key, systemImage: vectorSystemImage(for: team.icon))
            } else {
              Label("Workspace", systemImage: "square.grid.2x2")
            }
            Text("Updated \(relativeTimestamp(displayDocument.updatedAt))")
          }
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        }

        DocumentSection(title: "Document") {
          if isWaitingForContent {
            VStack(alignment: .leading, spacing: 12) {
              RoundedRectangle(cornerRadius: 5)
                .fill(Color.secondary.opacity(0.12))
                .frame(height: 18)
              RoundedRectangle(cornerRadius: 5)
                .fill(Color.secondary.opacity(0.1))
                .frame(height: 18)
              RoundedRectangle(cornerRadius: 5)
                .fill(Color.secondary.opacity(0.08))
                .frame(width: 220, height: 18)
            }
            .redacted(reason: .placeholder)
            .accessibilityLabel("Loading document content")
          } else if let contentError = viewModel.documentContentError, isLargeDocument {
            VStack(alignment: .leading, spacing: 10) {
              Label(contentError, systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.red)
              Button("Try again") {
                viewModel.retryDocumentContent()
              }
              .font(.caption.weight(.semibold))
            }
          } else if isLargeDocument {
            MarkdownDocumentView(markdown: draftContent)
            Label("Large document · read-only on iOS", systemImage: "doc.text")
              .font(.caption)
              .foregroundStyle(.secondary)
          } else if isEditingContent || draftContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            ZStack(alignment: .topLeading) {
              if draftContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("Start writing")
                  .font(.body)
                  .foregroundStyle(.secondary)
                  .padding(.horizontal, 4)
                  .padding(.vertical, 8)
              }

              VectorRichTextEditor(
                text: $draftContent,
                minHeight: 360,
                fontSize: 17,
                formatCommand: contentFormatCommand,
                isFocused: focusedField == .content,
                onFocusChange: { isFocused in
                  focusedField = isFocused ? .content : nil
                },
                onFormatStateChange: { state in
                  contentFormatState = state
                }
              )
            }
          } else {
            Button {
              withAnimation(.snappy(duration: 0.18)) {
                isEditingContent = true
                focusedField = .content
              }
            } label: {
              MarkdownDocumentView(markdown: draftContent)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }

          if !isLargeDocument {
            HStack(spacing: 10) {
              if !isEditingContent && !draftContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button("Edit document") {
                  withAnimation(.snappy(duration: 0.18)) {
                    isEditingContent = true
                    focusedField = .content
                  }
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.plain)
                .foregroundStyle(VectorTheme.accent)
              }

              Spacer()

              if isEditingContent || hasChanges {
                Button(action: saveChanges) {
                  HStack(spacing: 6) {
                    if isSaving {
                      ProgressView()
                        .controlSize(.small)
                    }
                    Text(hasChanges ? "Save changes" : "Done")
                  }
                  .font(.caption.weight(.semibold))
                  .padding(.horizontal, 10)
                  .frame(height: 30)
                  .background(VectorTheme.accent.opacity(hasChanges ? 0.15 : 0.08), in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isSaving)
              }
            }
          }
        }

        if let documentErrorMessage {
          Label(documentErrorMessage, systemImage: "exclamationmark.triangle")
            .font(.caption)
            .foregroundStyle(.red)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.horizontal, 22)
      .padding(.top, 22)
      .padding(.bottom, 140)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .background(VectorTheme.rowBackground)
    .navigationTitle(displayDocument.title)
    .vectorInlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Link(destination: viewModel.openWebURL(for: displayDocument)) {
          Image(systemName: "safari")
        }
        .accessibilityLabel("Open document on web")
      }
      #if os(iOS)
      ToolbarItemGroup(placement: .keyboard) {
        if focusedField == .content {
          MarkdownFormattingKeyboardToolbar(
            formatState: contentFormatState,
            onAction: applyMarkdownFormatting,
            onDismiss: {
              focusedField = nil
            }
          )
        }
      }
      #endif
    }
    .onAppear {
      syncDraft(from: displayDocument)
      viewModel.loadDocument(displayDocument)
    }
    .onChange(of: displayDocument) { _, nextDocument in
      guard !isEditingContent && focusedField == nil && !isSaving else {
        return
      }
      syncDraft(from: nextDocument)
    }
	  }

  private func syncDraft(from document: VectorDocument) {
    draftTitle = document.title
    draftContent = VectorDocumentContentNormalizer.plainText(from: document.content ?? "")
  }

  private func saveChanges() {
    guard !isSaving else {
      return
    }

    let title = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !title.isEmpty else {
      documentErrorMessage = "Title is required."
      return
    }

    isSaving = true
    documentErrorMessage = nil
    Task { @MainActor in
      do {
        let storedContent = VectorDocumentContentNormalizer.html(fromPlainText: draftContent)
        try await viewModel.updateDocument(documentId: displayDocument.id, title: title, content: storedContent)
        draftTitle = title
        isEditingContent = false
        focusedField = nil
        isTitleFocused = false
      } catch {
        documentErrorMessage = error.localizedDescription
      }
      isSaving = false
    }
  }

  private func applyMarkdownFormatting(_ action: MarkdownFormatAction) {
    focusedField = .content
    contentFormatCommand = VectorRichTextCommand(action: action)
  }
}

private enum DocumentDetailFocusField: Hashable {
  case title
  case content
}

private enum VectorDocumentContentNormalizer {
  static func plainText(from content: String) -> String {
    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.contains("<") && trimmed.contains(">") else {
      return content
    }

    var output = trimmed
      .replacingOccurrences(of: #"(?i)<br\s*/?>"#, with: "\n", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)</p\s*>"#, with: "\n\n", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)</h1\s*>"#, with: "\n\n", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)</h2\s*>"#, with: "\n\n", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)</h3\s*>"#, with: "\n\n", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)<h1[^>]*>"#, with: "# ", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)<h2[^>]*>"#, with: "## ", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)<h3[^>]*>"#, with: "### ", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)<li[^>]*>"#, with: "- ", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)</li\s*>"#, with: "\n", options: .regularExpression)
      .replacingOccurrences(of: #"(?i)</div\s*>"#, with: "\n", options: .regularExpression)
      .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)

    output = output
      .replacingOccurrences(of: "&nbsp;", with: " ")
      .replacingOccurrences(of: "&amp;", with: "&")
      .replacingOccurrences(of: "&lt;", with: "<")
      .replacingOccurrences(of: "&gt;", with: ">")
      .replacingOccurrences(of: "&quot;", with: "\"")
      .replacingOccurrences(of: "&#39;", with: "'")
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)

    return output.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func html(fromPlainText text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return ""
    }

    let lines = trimmed.components(separatedBy: .newlines)
    var html: [String] = []
    var listItems: [String] = []

    func flushList() {
      guard !listItems.isEmpty else { return }
      html.append("<ul>\(listItems.map { "<li>\($0)</li>" }.joined())</ul>")
      listItems.removeAll()
    }

    for rawLine in lines {
      let line = rawLine.trimmingCharacters(in: .whitespaces)
      if line.isEmpty {
        flushList()
        continue
      }

      if line.hasPrefix("### ") {
        flushList()
        html.append("<h3>\(escapeHTML(String(line.dropFirst(4))))</h3>")
      } else if line.hasPrefix("## ") {
        flushList()
        html.append("<h2>\(escapeHTML(String(line.dropFirst(3))))</h2>")
      } else if line.hasPrefix("# ") {
        flushList()
        html.append("<h1>\(escapeHTML(String(line.dropFirst(2))))</h1>")
      } else if line.hasPrefix("- ") {
        listItems.append(escapeHTML(String(line.dropFirst(2))))
      } else if line.hasPrefix("> ") {
        flushList()
        html.append("<blockquote><p>\(escapeHTML(String(line.dropFirst(2))))</p></blockquote>")
      } else {
        flushList()
        html.append("<p>\(escapeHTML(line))</p>")
      }
    }

    flushList()
    return html.joined()
  }

  private static func escapeHTML(_ value: String) -> String {
    value
      .replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
      .replacingOccurrences(of: "'", with: "&#39;")
  }
}

struct ProjectDetailScreen: View {
  let project: VectorProject
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var tab = "issues"

  private var projectIssues: [VectorIssueRow] {
    viewModel.issues.filter { $0.projectId == project.id || $0.projectKey == project.key }
  }

  var body: some View {
    VStack(spacing: 0) {
      EntityHeader(
        icon: project.icon,
        color: project.color,
        title: project.name,
        subtitle: project.description ?? project.key
      )
      CompactSegmentedControl(options: ["issues", "activity", "members"], selection: $tab) { $0.capitalized }
        .padding()

      List {
        if tab == "issues" {
          if projectIssues.isEmpty {
            VectorEmptyState(
              title: "No project issues",
              systemImage: "checklist",
              message: "Issues linked to this project will appear here."
            )
            .frame(minHeight: 190)
            .listRowSeparator(.hidden)
          } else {
            ForEach(projectIssues, id: \.rowId) { issue in
              NavigationLink {
                IssueDetailScreen(issue: issue, viewModel: viewModel)
              } label: {
                IssueRowView(
                  issue: issue,
                  workspaceOptions: viewModel.workspaceOptions,
                  baseURL: viewModel.configuration.webBaseURL
                )
              }
            }
          }
        } else if tab == "members" {
          if let lead = project.lead {
            HStack(spacing: 10) {
              VectorUserAvatar(user: lead, baseURL: viewModel.configuration.webBaseURL, size: 28)
              VStack(alignment: .leading, spacing: 2) {
                Text(lead.displayName)
                  .font(.subheadline.weight(.medium))
                Text("Lead")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
            }
            .padding(.vertical, 4)
          } else {
            VectorEmptyState(
              title: "No project members",
              systemImage: "person.crop.circle",
              message: "Project leads and members will appear here."
            )
            .frame(minHeight: 190)
            .listRowSeparator(.hidden)
          }
        } else {
          VectorEmptyState(
            title: "No project activity",
            systemImage: "rays",
            message: "Project updates will appear here when activity is available on mobile."
          )
          .frame(minHeight: 190)
          .listRowSeparator(.hidden)
        }
        Link(destination: viewModel.openWebURL(for: project)) {
          Label("Open project on web", systemImage: "safari")
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(VectorTheme.rowBackground)
    }
    .navigationTitle(project.key)
    .vectorInlineNavigationTitle()
  }
}

struct TeamRow: View {
  let team: VectorTeam

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: vectorSystemImage(for: team.icon))
        .foregroundStyle(Color(vectorHex: team.color))
        .frame(width: 24)
      VStack(alignment: .leading, spacing: 3) {
        Text(team.name)
          .font(.subheadline.weight(.medium))
        Text(team.key)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
      }
      Spacer()
      if let count = team.memberCount {
        VectorPill(text: "\(count)", color: .secondary, systemImage: "person.2")
      }
    }
    .padding(.vertical, 4)
  }
}

struct TeamDetailScreen: View {
  let team: VectorTeam
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var tab = "issues"

  private var teamIssues: [VectorIssueRow] {
    viewModel.issues.filter { $0.teamId == team.id || $0.teamKey == team.key }
  }

  var body: some View {
    VStack(spacing: 0) {
      EntityHeader(
        icon: team.icon,
        color: team.color,
        title: team.name,
        subtitle: team.description ?? team.key
      )
      CompactSegmentedControl(options: ["issues", "projects", "members", "activity"], selection: $tab) { $0.capitalized }
        .padding()

      List {
        if tab == "issues" {
          if teamIssues.isEmpty {
            VectorEmptyState(
              title: "No team issues",
              systemImage: "checklist",
              message: "Issues owned by this team will appear here."
            )
            .frame(minHeight: 190)
            .listRowSeparator(.hidden)
          } else {
            ForEach(teamIssues, id: \.rowId) { issue in
              NavigationLink {
                IssueDetailScreen(issue: issue, viewModel: viewModel)
              } label: {
                IssueRowView(
                  issue: issue,
                  workspaceOptions: viewModel.workspaceOptions,
                  baseURL: viewModel.configuration.webBaseURL
                )
              }
            }
          }
        } else if tab == "projects" {
          let teamProjects = viewModel.projects.filter { $0.teamId == team.id }
          if teamProjects.isEmpty {
            VectorEmptyState(
              title: "No team projects",
              systemImage: "folder",
              message: "Projects linked to this team will appear here."
            )
            .frame(minHeight: 190)
            .listRowSeparator(.hidden)
          } else {
            ForEach(teamProjects) { project in
              NavigationLink {
                ProjectDetailScreen(project: project, viewModel: viewModel)
              } label: {
                ProjectRow(project: project)
              }
            }
          }
        } else if tab == "members" {
          if let lead = team.lead {
            HStack(spacing: 10) {
              VectorUserAvatar(user: lead, baseURL: viewModel.configuration.webBaseURL, size: 28)
              VStack(alignment: .leading, spacing: 2) {
                Text(lead.displayName)
                  .font(.subheadline.weight(.medium))
                Text("Lead")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
            }
            .padding(.vertical, 4)
          } else {
            VectorEmptyState(
              title: "No team members",
              systemImage: "person.2",
              message: "Team leads and members will appear here."
            )
            .frame(minHeight: 190)
            .listRowSeparator(.hidden)
          }
        } else {
          VectorEmptyState(
            title: "No team activity",
            systemImage: "rays",
            message: "Team updates will appear here when activity is available on mobile."
          )
          .frame(minHeight: 190)
          .listRowSeparator(.hidden)
        }
        Link(destination: viewModel.openWebURL(for: team)) {
          Label("Open team on web", systemImage: "safari")
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(VectorTheme.rowBackground)
    }
    .navigationTitle(team.key)
    .vectorInlineNavigationTitle()
  }
}

struct EntityHeader: View {
  let icon: String?
  let color: String?
  let title: String
  let subtitle: String

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: vectorSystemImage(for: icon))
        .font(.title3)
        .foregroundStyle(Color(vectorHex: color))
        .frame(width: 32, height: 32)
        .background(Color(vectorHex: color).opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline)
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
      Spacer()
    }
    .padding()
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(VectorTheme.rowBackground)
  }
}

private struct NotificationOnboardingSheet: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var pushCoordinator: VectorPushNotificationCoordinator
  let onDone: () -> Void
  @State private var selectedCategories = Set(VectorNotificationCategory.allCases)
  @State private var isEnabling = false

  private var requiresSettings: Bool {
    pushCoordinator.authorizationStatus == .denied
  }

  var body: some View {
    NavigationStack {
      List {
        Section {
          VStack(alignment: .leading, spacing: 8) {
            Label("Stay updated", systemImage: "bell.badge")
              .font(.headline)
            Text(requiresSettings
              ? "Notifications are disabled for Vector. You can enable them in Settings."
              : "Vector can notify you about work that needs your attention on this iPhone.")
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }
          .padding(.vertical, 4)
        }

        Section("Notify me about") {
          ForEach(VectorNotificationCategory.allCases) { category in
            Toggle(isOn: Binding(
              get: { selectedCategories.contains(category) },
              set: { isEnabled in
                if isEnabled {
                  selectedCategories.insert(category)
                } else {
                  selectedCategories.remove(category)
                }
              }
            )) {
              Text(category.label)
            }
          }
        }
      }
      .navigationTitle("Notifications")
      .vectorInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Not now", action: onDone)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button {
            enableNotifications()
          } label: {
            if isEnabling {
              ProgressView()
            } else {
              Text(requiresSettings ? "Open Settings" : "Enable")
            }
          }
          .disabled(isEnabling || selectedCategories.isEmpty)
        }
      }
    }
  }

  private func enableNotifications() {
    guard !isEnabling else {
      return
    }

    isEnabling = true
    let disabledCategories = Set(VectorNotificationCategory.allCases).subtracting(selectedCategories)
    viewModel.configurePushPreferences(
      enabledCategories: selectedCategories,
      disabledCategories: disabledCategories
    )

    if requiresSettings {
      #if os(iOS)
        if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
          UIApplication.shared.open(settingsURL)
        }
      #endif
      isEnabling = false
      onDone()
      return
    }

    Task { @MainActor in
      await pushCoordinator.requestRegistration()
      if let token = pushCoordinator.deviceToken {
        viewModel.upsertMobilePushToken(token)
      }
      isEnabling = false
      onDone()
    }
  }
}

struct MobileSettingsScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  @ObservedObject var pushCoordinator: VectorPushNotificationCoordinator

  var body: some View {
    List {
      Section("Account") {
        HStack {
          Label(sessionController.user?.displayName ?? "Signed in", systemImage: "person.crop.circle")
          Spacer()
          if sessionController.isDemoMode {
            Text("Preview")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        Button(role: .destructive) {
          sessionController.signOut()
        } label: {
          Label(sessionController.isDemoMode ? "Exit preview" : "Sign out", systemImage: "rectangle.portrait.and.arrow.right")
        }
      }

      Section("Instance") {
        LabeledContent("App URL", value: viewModel.configuration.webBaseURL.absoluteString)
        WorkspaceSettingsRow(
          sessionController: sessionController,
          currentOrgSlug: viewModel.configuration.orgSlug
        )
      }

      Section("Mobile") {
        NavigationLink {
          ProfileStatusSettingsScreen(viewModel: viewModel)
        } label: {
          Label("Profile status", systemImage: "person.crop.circle.badge.checkmark")
        }
        NavigationLink {
          MobilePushNotificationsScreen(viewModel: viewModel, pushCoordinator: pushCoordinator)
        } label: {
          Label("Notifications", systemImage: "bell.badge")
        }
      }

      Section("Web only") {
        Link(destination: viewModel.configuration.webURL(path: "/settings/profile")) {
          Label("Profile on web", systemImage: "safari")
        }
        Link(destination: viewModel.configuration.webURL(path: "/\(viewModel.configuration.orgSlug)/settings")) {
          Label("Workspace settings", systemImage: "building.2")
        }
        Link(destination: viewModel.configuration.workspaceWebURL) {
          Label("Open workspace", systemImage: "arrow.up.forward.app")
        }
      }
    }
    .navigationTitle("Settings")
    .scrollContentBackground(.hidden)
    .background(VectorTheme.rowBackground)
    .onAppear {
      viewModel.loadSettings()
      Task {
        await pushCoordinator.refreshAuthorizationStatus()
      }
    }
  }
}

struct ProfileStatusSettingsScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var customText = ""
  @State private var customEmoji = ""
  @State private var clearAfter: StatusClearAfter = .never

  var body: some View {
    List {
      Section("Presence") {
        ForEach(VectorPresenceStatus.selectableCases) { presence in
          let isSelected = viewModel.userStatus?.presence == presence
          Button {
            viewModel.setPresence(presence)
          } label: {
            ProfilePresenceSettingsRow(
              presence: presence,
              isSelected: isSelected,
              isPending: viewModel.pendingPresence == presence
            )
          }
          .buttonStyle(.plain)
          .contentShape(Rectangle())
          .disabled(viewModel.pendingPresence == presence)
          .listRowBackground(
            isSelected
              ? Color(vectorHex: presence.colorHex).opacity(0.12)
              : VectorTheme.rowBackground
          )
        }
      }

      Section("Custom status") {
        HStack {
          Text("Emoji")
          TextField("Optional", text: $customEmoji)
            .multilineTextAlignment(.trailing)
        }
        HStack {
          Text("Status")
          TextField("What's happening?", text: $customText)
            .multilineTextAlignment(.trailing)
        }
        Picker("Clear", selection: $clearAfter) {
          ForEach(StatusClearAfter.allCases) { option in
            Text(option.label).tag(option)
          }
        }

        Button {
          viewModel.setCustomStatus(
            text: customText,
            emoji: customEmoji,
            clearsAt: clearAfter.clearsAt
          )
        } label: {
          if viewModel.isUpdatingUserStatus && viewModel.pendingPresence == nil {
            HStack {
              ProgressView()
                .controlSize(.small)
              Text("Saving custom status")
            }
          } else {
            Label("Save custom status", systemImage: "checkmark.circle")
          }
        }
        .disabled(viewModel.isUpdatingUserStatus)

        if (viewModel.userStatus?.customText?.isEmpty == false) || (viewModel.userStatus?.customEmoji?.isEmpty == false) {
          Button(role: .destructive) {
            customText = ""
            customEmoji = ""
            clearAfter = .never
            viewModel.clearCustomStatus()
          } label: {
            if viewModel.isUpdatingUserStatus && viewModel.pendingPresence == nil {
              HStack {
                ProgressView()
                  .controlSize(.small)
                Text("Clearing custom status")
              }
            } else {
              Label("Clear custom status", systemImage: "xmark.circle")
            }
          }
          .disabled(viewModel.isUpdatingUserStatus)
        }
      }

      if let status = viewModel.userStatus {
        Section("Current") {
          LabeledContent("Presence", value: status.presence.label)
          if let emoji = status.customEmoji, !emoji.isEmpty {
            LabeledContent("Emoji", value: emoji)
          }
          if let text = status.customText, !text.isEmpty {
            LabeledContent("Status", value: text)
          }
        }
      }

      if let error = viewModel.settingsErrorMessage {
        Section {
          Label(error, systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }
      }
    }
    .navigationTitle("Profile Status")
    .scrollContentBackground(.hidden)
    .background(VectorTheme.rowBackground)
    .onAppear {
      viewModel.loadSettings()
      syncDraft()
    }
    .onChange(of: viewModel.userStatus) {
      syncDraft()
    }
  }

  private func syncDraft() {
    customText = viewModel.userStatus?.customText ?? ""
    customEmoji = viewModel.userStatus?.customEmoji ?? ""
  }
}

private struct ProfilePresenceSettingsRow: View {
  let presence: VectorPresenceStatus
  let isSelected: Bool
  let isPending: Bool

  var body: some View {
    HStack(spacing: 12) {
      ProfilePresenceGlyph(presence: presence, isSelected: isSelected)

      VStack(alignment: .leading, spacing: 2) {
        Text(presence.label)
          .font(.body.weight(isSelected ? .semibold : .regular))
        if isSelected {
          Text("Current status")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      Spacer()

      if isPending {
        ProgressView()
          .controlSize(.small)
      } else if isSelected {
        Image(systemName: "checkmark.circle.fill")
          .font(.body.weight(.semibold))
          .foregroundStyle(Color(vectorHex: presence.colorHex))
      }
    }
    .padding(.vertical, 3)
  }
}

private enum StatusClearAfter: String, CaseIterable, Identifiable {
  case never
  case oneHour
  case today
  case week

  var id: String { rawValue }

  var label: String {
    switch self {
    case .never: "Never"
    case .oneHour: "In 1 hour"
    case .today: "Tonight"
    case .week: "In 1 week"
    }
  }

  var clearsAt: Double? {
    let now = Date()
    let calendar = Calendar.current
    switch self {
    case .never:
      return nil
    case .oneHour:
      return now.addingTimeInterval(60 * 60).timeIntervalSince1970 * 1000
    case .today:
      return (calendar.date(bySettingHour: 23, minute: 59, second: 0, of: now) ?? now).timeIntervalSince1970 * 1000
    case .week:
      return now.addingTimeInterval(7 * 24 * 60 * 60).timeIntervalSince1970 * 1000
    }
  }
}

struct MobilePushNotificationsScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var pushCoordinator: VectorPushNotificationCoordinator

  private var currentRegistration: VectorMobilePushTokenRegistration? {
    guard let token = pushCoordinator.deviceToken else { return nil }
    return viewModel.mobilePushTokens.first {
      $0.token == token.value && $0.environment == token.environment && $0.disabledAt == nil
    }
  }

  var body: some View {
    List {
      Section("This iPhone") {
        LabeledContent("Permission", value: pushCoordinator.authorizationStatus.label)
        if let token = pushCoordinator.deviceToken {
          LabeledContent("APNs", value: currentRegistration == nil ? "Ready" : "Registered")
          LabeledContent("Environment", value: token.environment.capitalized)
        }
        if let error = pushCoordinator.registrationError {
          Label(error, systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }

        Button {
          Task {
            await pushCoordinator.requestRegistration()
            if let token = pushCoordinator.deviceToken {
              viewModel.upsertMobilePushToken(token)
            }
          }
        } label: {
          Label(currentRegistration == nil ? "Enable notifications on this iPhone" : "Refresh registration", systemImage: "bell.badge")
        }

        if let token = pushCoordinator.deviceToken, currentRegistration != nil {
          Button(role: .destructive) {
            viewModel.removeMobilePushToken(token)
            pushCoordinator.clearRegistration()
          } label: {
            Label("Remove this iPhone", systemImage: "trash")
          }
        }
      }

      Section("Notification categories") {
        ForEach(viewModel.notificationPreferences) { preference in
          Toggle(isOn: Binding(
            get: { preference.pushEnabled },
            set: { viewModel.setPushEnabled(for: preference.category, isEnabled: $0) }
          )) {
            Text(preference.category.label)
          }
        }
      }

      Section("Registered devices") {
        if viewModel.mobilePushTokens.filter({ $0.disabledAt == nil }).isEmpty {
          Label("No registered iOS devices", systemImage: "iphone")
            .foregroundStyle(.secondary)
        } else {
          ForEach(viewModel.mobilePushTokens.filter { $0.disabledAt == nil }) { token in
            VStack(alignment: .leading, spacing: 3) {
              Text(token.deviceLabel ?? "iOS device")
                .font(.subheadline.weight(.medium))
              Text(token.environment.capitalized)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        }
      }

      if let error = viewModel.settingsErrorMessage {
        Section {
          Label(error, systemImage: "exclamationmark.triangle")
            .foregroundStyle(.red)
        }
      }
    }
    .navigationTitle("Notifications")
    .scrollContentBackground(.hidden)
    .background(VectorTheme.rowBackground)
    .onAppear {
      viewModel.loadSettings()
      Task {
        await pushCoordinator.refreshAuthorizationStatus()
      }
    }
  }
}

struct SkeletonIssueList: View {
  var body: some View {
    List(0..<8, id: \.self) { _ in
      VStack(alignment: .leading, spacing: 8) {
        RoundedRectangle(cornerRadius: 4)
          .frame(width: 220, height: 14)
        RoundedRectangle(cornerRadius: 4)
          .frame(width: 150, height: 10)
      }
      .foregroundStyle(Color.secondary.opacity(0.25))
      .redacted(reason: .placeholder)
    }
    .listStyle(.plain)
  }
}

#Preview {
  VectorMobileRootView(sessionController: VectorMobileSessionController())
}

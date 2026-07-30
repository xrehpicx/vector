import AVKit
import Combine
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
  import UIKit
#endif

struct MobileConversationHomeScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  let directOnly: Bool
  @State private var searchText = ""

  private var visibleChannels: [VectorChannelListItem] {
    let kindFiltered = viewModel.collaborationChannels.filter {
      directOnly ? $0.channel.kind.isDirect : !$0.channel.kind.isDirect
    }
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return kindFiltered }
    return kindFiltered.filter {
      $0.channel.name.localizedCaseInsensitiveContains(query)
        || ($0.channel.topic?.localizedCaseInsensitiveContains(query) ?? false)
    }
  }

  var body: some View {
    Group {
      if viewModel.isLoadingCollaboration && viewModel.collaborationChannels.isEmpty {
        List {
          ForEach(0..<7, id: \.self) { _ in
            HStack(spacing: 12) {
              Circle()
                .fill(Color.secondary.opacity(0.13))
                .frame(width: 34, height: 34)
              VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                  .fill(Color.secondary.opacity(0.13))
                  .frame(width: 132, height: 12)
                RoundedRectangle(cornerRadius: 4)
                  .fill(Color.secondary.opacity(0.09))
                  .frame(width: 208, height: 9)
              }
            }
            .redacted(reason: .placeholder)
          }
        }
      } else if let error = viewModel.collaborationError,
                viewModel.collaborationChannels.isEmpty
      {
        ContentUnavailableView(
          "Unable to load conversations",
          systemImage: "wifi.exclamationmark",
          description: Text(error)
        )
      } else {
        List {
          if !directOnly {
            Section {
              ScrollView(.horizontal) {
                HStack(spacing: 10) {
                  ForEach(MobileSmartMessageMode.allCases) { mode in
                    NavigationLink {
                      MobileSmartMessagesScreen(mode: mode, viewModel: viewModel)
                    } label: {
                      MobileConversationShortcutLabel(
                        label: mode.title,
                        systemImage: mode.systemImage
                      )
                    }
                    .buttonStyle(.plain)
                  }
                  NavigationLink {
                    MobileAgentsScreen(viewModel: viewModel)
                  } label: {
                    MobileConversationShortcutLabel(label: "Agents", systemImage: "cpu")
                  }
                  .buttonStyle(.plain)
                }
                .padding(.vertical, 2)
              }
              .scrollIndicators(.hidden)
              .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 0))
            }
          }

          Section(directOnly ? "Direct messages" : "Channels") {
            if visibleChannels.isEmpty {
              ContentUnavailableView(
                searchText.isEmpty
                  ? (directOnly ? "No direct messages" : "No channels")
                  : "No matches",
                systemImage: directOnly ? "bubble.left" : "number",
                description: Text(
                  searchText.isEmpty
                    ? "New conversations will appear here."
                    : "Try another name or topic."
                )
              )
              .listRowBackground(Color.clear)
            } else {
              ForEach(visibleChannels) { item in
                NavigationLink {
                  MobileChannelScreen(channel: item, viewModel: viewModel)
                } label: {
                  MobileChannelRow(item: item)
                }
              }
            }
          }

          if !directOnly {
            let directChannels = viewModel.collaborationChannels.filter(\.channel.kind.isDirect)
            if !directChannels.isEmpty {
              Section("Direct messages") {
                ForEach(directChannels.prefix(4)) { item in
                  NavigationLink {
                    MobileChannelScreen(channel: item, viewModel: viewModel)
                  } label: {
                    MobileChannelRow(item: item)
                  }
                }
              }
            }
          }
        }
        .listStyle(.plain)
        .refreshable {
          viewModel.loadCollaboration()
        }
      }
    }
    .navigationTitle(directOnly ? "Direct Messages" : "Home")
    .searchable(
      text: $searchText,
      placement: .automatic,
      prompt: directOnly ? "Search direct messages" : "Search channels"
    )
    .onAppear {
      viewModel.loadCollaboration()
    }
  }
}

private struct MobileConversationShortcutLabel: View {
  let label: String
  let systemImage: String

  var body: some View {
    HStack(spacing: 7) {
      Image(systemName: systemImage)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
      Text(label)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.primary)
    }
    .padding(.horizontal, 13)
    .frame(minHeight: 42)
    .background(Color.secondary.opacity(0.075), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private enum MobileSmartMessageMode: String, CaseIterable, Identifiable {
  case priority
  case threads
  case saved

  var id: String { rawValue }
  var title: String {
    switch self {
    case .priority: "Priority"
    case .threads: "Threads"
    case .saved: "Saved"
    }
  }
  var systemImage: String {
    switch self {
    case .priority: "at"
    case .threads: "bubble.left.and.bubble.right"
    case .saved: "bookmark"
    }
  }
  var emptyTitle: String {
    switch self {
    case .priority: "You’re caught up"
    case .threads: "No unread thread replies"
    case .saved: "Nothing saved yet"
    }
  }
  var emptyDescription: String {
    switch self {
    case .priority: "New direct messages, mentions, and followed replies will appear here."
    case .threads: "Follow a thread to keep its new replies in this view."
    case .saved: "Save a message from its touch-and-hold menu to keep it here."
    }
  }
}

private struct MobileChannelRow: View {
  let item: VectorChannelListItem

  var body: some View {
    HStack(spacing: 12) {
      ZStack {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(item.channel.kind.isDirect ? VectorTheme.accent.opacity(0.12) : Color.secondary.opacity(0.09))
        Image(systemName: item.channel.kind.systemImage)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(item.channel.kind.isDirect ? VectorTheme.accent : .secondary)
      }
      .frame(width: 36, height: 36)

      VStack(alignment: .leading, spacing: 2) {
        Text(item.channel.name)
          .font(.body.weight(item.unreadDisplayCount > 0 ? .semibold : .medium))
          .foregroundStyle(.primary)
          .lineLimit(1)
        if let topic = item.channel.topic, !topic.isEmpty {
          Text(topic)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }

      Spacer(minLength: 8)
      if item.unreadDisplayCount > 0 {
        Text(item.unreadDisplayCount > 99 ? "99+" : "\(item.unreadDisplayCount)")
          .font(.caption2.weight(.bold))
          .foregroundStyle(.white)
          .padding(.horizontal, 6)
          .frame(minWidth: 20, minHeight: 20)
          .background(VectorTheme.accent, in: Capsule())
          .accessibilityLabel("\(item.unreadDisplayCount) unread messages")
      }
    }
    .frame(minHeight: 48)
    .contentShape(Rectangle())
  }
}

private struct MobileSmartMessagesScreen: View {
  let mode: MobileSmartMessageMode
  @ObservedObject var viewModel: VectorMobileViewModel

  private var rows: [(message: VectorMessageView, channel: VectorChannelListItem, reason: String?)] {
    switch mode {
    case .priority:
      return viewModel.priorityMessages.compactMap { item in
        guard let channel = viewModel.collaborationChannels.first(where: {
          $0.channel.id == item.channel.id
        }) else { return nil }
        return (item.message, channel, item.reason)
      }
    case .threads:
      return viewModel.priorityMessages.compactMap { item in
        guard item.reason == "thread_reply" || item.reason == "followed_thread",
              let channel = viewModel.collaborationChannels.first(where: {
                $0.channel.id == item.channel.id
              })
        else { return nil }
        return (item.message, channel, item.reason)
      }
    case .saved:
      return viewModel.savedMessages.compactMap { message in
        guard let channel = viewModel.collaborationChannels.first(where: {
          $0.channel.id == message.message.channelId
        }) else { return nil }
        return (message, channel, nil)
      }
    }
  }

  var body: some View {
    Group {
      if viewModel.isLoadingSmartMessages && rows.isEmpty {
        List {
          ForEach(0..<5, id: \.self) { _ in
            MobileMessageSkeleton()
              .redacted(reason: .placeholder)
          }
        }
      } else if rows.isEmpty {
        ContentUnavailableView(
          mode.emptyTitle,
          systemImage: mode.systemImage,
          description: Text(mode.emptyDescription)
        )
      } else {
        List {
          ForEach(rows, id: \.message.id) { row in
            NavigationLink {
              if mode == .threads {
                MobileSmartThreadScreen(
                  previewMessage: row.message,
                  channel: row.channel,
                  viewModel: viewModel
                )
              } else {
                MobileChannelScreen(channel: row.channel, viewModel: viewModel)
              }
            } label: {
              VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 6) {
                  Label(row.channel.channel.name, systemImage: row.channel.channel.kind.systemImage)
                  if let reason = row.reason {
                    Text(smartReasonLabel(reason))
                  }
                  Spacer()
                  Text(messageTimestamp(row.message.message.createdAt))
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                Text(
                  row.message.authorUser?.displayName
                    ?? row.message.authorAgent?.name
                    ?? "Vector"
                )
                .font(.subheadline.weight(.semibold))
                Text(row.message.message.body)
                  .font(.subheadline)
                  .foregroundStyle(.primary)
                  .lineLimit(3)
              }
              .padding(.vertical, 5)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
              Button {
                Task { await viewModel.toggleSaved(row.message) }
              } label: {
                Label(
                  row.message.saved ? "Unsave" : "Save",
                  systemImage: row.message.saved ? "bookmark.slash" : "bookmark"
                )
              }
              .tint(VectorTheme.accent)
            }
          }
        }
        .listStyle(.plain)
      }
    }
    .navigationTitle(mode.title)
    .refreshable {
      viewModel.loadSmartMessages()
    }
    .onAppear {
      viewModel.loadSmartMessages()
    }
  }
}

private struct MobileSmartThreadScreen: View {
  let previewMessage: VectorMessageView
  let channel: VectorChannelListItem
  @ObservedObject var viewModel: VectorMobileViewModel

  private var rootId: VectorID {
    previewMessage.message.threadRootId ?? previewMessage.id
  }

  private var rootMessage: VectorMessageView? {
    viewModel.channelMessages.first(where: { $0.id == rootId })
      ?? (previewMessage.id == rootId ? previewMessage : nil)
  }

  var body: some View {
    Group {
      if let rootMessage {
        MobileThreadScreen(rootMessage: rootMessage, viewModel: viewModel)
      } else if viewModel.isLoadingChannel {
        VStack(spacing: 12) {
          ProgressView()
          Text("Opening thread")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Thread")
        .vectorInlineNavigationTitle()
      } else {
        ContentUnavailableView(
          "Thread unavailable",
          systemImage: "bubble.left.and.exclamationmark.bubble.right",
          description: Text("This thread may no longer be available in the channel.")
        )
        .navigationTitle("Thread")
        .vectorInlineNavigationTitle()
      }
    }
    .onAppear {
      if rootMessage == nil {
        viewModel.openChannel(channel)
      }
    }
  }
}

struct MobileChannelScreen: View {
  let channel: VectorChannelListItem
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var isShowingDetails = false

  var body: some View {
    VStack(spacing: 0) {
      if let description = channel.channel.description, !description.isEmpty {
        HStack(spacing: 7) {
          Image(systemName: "number")
          Text(description)
            .lineLimit(1)
          Spacer()
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .frame(minHeight: 32)
        .background(Color.secondary.opacity(0.055))
        .overlay(alignment: .bottom) {
          Divider()
        }
      }

      MobileMessageTimeline(viewModel: viewModel)

      MobileMessageComposer(viewModel: viewModel)
        .background(VectorTheme.surfaceBackground)
        .overlay(alignment: .top) {
          Divider()
        }
    }
    .navigationTitle(channel.channel.name)
    .vectorInlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button {
          isShowingDetails = true
        } label: {
          Image(systemName: "info.circle")
        }
        .accessibilityLabel("Channel details")
      }
    }
    .sheet(isPresented: $isShowingDetails) {
      MobileChannelDetailsSheet(channel: channel, viewModel: viewModel)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
    .onAppear {
      viewModel.openChannel(channel)
    }
  }
}

private struct MobileMessageTimeline: View {
  @ObservedObject var viewModel: VectorMobileViewModel

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(spacing: 0) {
          if viewModel.isLoadingChannel && viewModel.channelMessages.isEmpty {
            ForEach(0..<5, id: \.self) { _ in
              MobileMessageSkeleton()
            }
          } else if viewModel.channelMessages.isEmpty {
            ContentUnavailableView(
              "Start the conversation",
              systemImage: "bubble.left.and.bubble.right",
              description: Text("Share an update, attach a file, or mention an agent.")
            )
            .padding(.top, 80)
          } else {
            ForEach(viewModel.channelMessages) { message in
              MobileMessageRow(message: message, viewModel: viewModel)
                .id(message.id)
            }
          }

          if let error = viewModel.collaborationError, !error.isEmpty {
            Label(error, systemImage: "exclamationmark.triangle")
              .font(.caption)
              .foregroundStyle(.red)
              .padding()
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        .padding(.vertical, 8)
      }
      .scrollDismissesKeyboard(.interactively)
      .onChange(of: viewModel.channelMessages.count) {
        guard let lastId = viewModel.channelMessages.last?.id else { return }
        withAnimation(.easeOut(duration: 0.2)) {
          proxy.scrollTo(lastId, anchor: .bottom)
        }
      }
    }
  }
}

private struct MobileThreadScreen: View {
  let rootMessage: VectorMessageView
  @ObservedObject var viewModel: VectorMobileViewModel

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(spacing: 0) {
            MobileMessageRow(
              message: rootMessage,
              viewModel: viewModel,
              showsThreadAction: false
            )
            Divider()
              .padding(.leading, 60)
              .padding(.vertical, 4)

            if viewModel.isLoadingThread && viewModel.threadMessages.isEmpty {
              ForEach(0..<3, id: \.self) { _ in
                MobileMessageSkeleton()
              }
            } else if viewModel.threadMessages.isEmpty {
              ContentUnavailableView(
                "No replies yet",
                systemImage: "bubble.left",
                description: Text("Reply below to continue this thread.")
              )
              .padding(.top, 48)
            } else {
              ForEach(viewModel.threadMessages) { reply in
                MobileMessageRow(
                  message: reply,
                  viewModel: viewModel,
                  showsThreadAction: false
                )
                .id(reply.id)
              }
            }
          }
          .padding(.vertical, 8)
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: viewModel.threadMessages.count) {
          guard let lastId = viewModel.threadMessages.last?.id else { return }
          withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo(lastId, anchor: .bottom)
          }
        }
      }

      MobileMessageComposer(
        viewModel: viewModel,
        threadRootId: rootMessage.id,
        replyToMessageId: viewModel.threadMessages.last?.id ?? rootMessage.id
      )
      .background(VectorTheme.surfaceBackground)
      .overlay(alignment: .top) { Divider() }
    }
    .navigationTitle("Thread")
    .vectorInlineNavigationTitle()
    .onAppear {
      viewModel.openThread(rootMessageId: rootMessage.id)
    }
  }
}

private struct MobileMessageRow: View {
  let message: VectorMessageView
  @ObservedObject var viewModel: VectorMobileViewModel
  var showsThreadAction = true
  @State private var selectedAttachment: VectorMessageAttachment?
  @State private var isShowingThread = false

  private var authorName: String {
    message.authorUser?.displayName
      ?? message.authorAgent?.name
      ?? "Vector"
  }

  private var initials: String {
    let parts = authorName.split(separator: " ")
    let value = parts.prefix(2).compactMap(\.first).map(String.init).joined()
    return value.isEmpty ? "V" : value.uppercased()
  }

  private var agentOwnerName: String? {
    guard let authorAgent = message.authorAgent else { return nil }
    return viewModel.channelAgents.first(where: {
      $0.agent.id == authorAgent.id
    })?.owner?.displayName
  }

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack {
        Circle()
          .fill(message.authorAgent == nil ? Color.secondary.opacity(0.11) : VectorTheme.accent.opacity(0.14))
        if message.authorAgent != nil {
          Image(systemName: "cpu")
            .font(.caption.weight(.semibold))
            .foregroundStyle(VectorTheme.accent)
        } else {
          Text(initials)
            .font(.caption2.weight(.bold))
            .foregroundStyle(.secondary)
        }
      }
      .frame(width: 34, height: 34)
      .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 5) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(authorName)
            .font(.subheadline.weight(.semibold))
          if message.authorAgent != nil {
            Text("AGENT")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(VectorTheme.accent)
              .padding(.horizontal, 5)
              .padding(.vertical, 2)
              .background(VectorTheme.accent.opacity(0.1), in: Capsule())
            Text("by \(agentOwnerName ?? "workspace member")")
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Spacer(minLength: 6)
          Text(messageTimestamp(message.message.createdAt))
            .font(.caption2)
            .foregroundStyle(.secondary)
        }

        if message.message.deletedAt != nil {
          Text("This message was deleted.")
            .font(.subheadline)
            .italic()
            .foregroundStyle(.secondary)
        } else if !message.message.body.isEmpty {
          Text(message.message.body)
            .font(.body)
            .foregroundStyle(.primary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
        }

        if !message.attachments.isEmpty {
          LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 132, maximum: 260), spacing: 8)],
            alignment: .leading,
            spacing: 8
          ) {
            ForEach(message.attachments) { attachment in
              Button {
                selectedAttachment = attachment
              } label: {
                MobileAttachmentPreview(attachment: attachment, viewModel: viewModel)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Preview \(attachment.name)")
            }
          }
          .padding(.top, 2)
        }

        if showsThreadAction && message.message.replyCount > 0 {
          Button {
            isShowingThread = true
          } label: {
            Label(
              "\(Int(message.message.replyCount)) \(message.message.replyCount == 1 ? "reply" : "replies")",
              systemImage: "bubble.left"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(VectorTheme.accent)
            .padding(.top, 2)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
    .contextMenu {
      Button {
        #if os(iOS)
          UIPasteboard.general.string = message.message.body
        #endif
      } label: {
        Label("Copy text", systemImage: "doc.on.doc")
      }
      Button {
        isShowingThread = true
      } label: {
        Label("Reply in thread", systemImage: "bubble.left.and.bubble.right")
      }
      Button {
        Task { await viewModel.toggleSaved(message) }
      } label: {
        Label(message.saved ? "Remove from saved" : "Save for later", systemImage: "bookmark")
      }
    }
    .sheet(item: $selectedAttachment) { attachment in
      MobileMediaViewer(attachment: attachment, viewModel: viewModel)
    }
    .navigationDestination(isPresented: $isShowingThread) {
      MobileThreadScreen(rootMessage: message, viewModel: viewModel)
    }
  }
}

private struct MobileMessageSkeleton: View {
  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(Color.secondary.opacity(0.12))
        .frame(width: 34, height: 34)
      VStack(alignment: .leading, spacing: 7) {
        RoundedRectangle(cornerRadius: 4)
          .fill(Color.secondary.opacity(0.13))
          .frame(width: 116, height: 11)
        RoundedRectangle(cornerRadius: 4)
          .fill(Color.secondary.opacity(0.09))
          .frame(height: 10)
        RoundedRectangle(cornerRadius: 4)
          .fill(Color.secondary.opacity(0.09))
          .frame(width: 210, height: 10)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }
}

@MainActor
private final class MobileAttachmentLoader: ObservableObject {
  @Published var url: URL?
  @Published var errorMessage: String?
  private var cancellable: AnyCancellable?

  init(attachment: VectorMessageAttachment, viewModel: VectorMobileViewModel) {
    cancellable = viewModel.attachmentURL(attachment.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.errorMessage = error.localizedDescription
          }
        },
        receiveValue: { [weak self] result in
          self?.url = result.flatMap { URL(string: $0.url) }
        }
      )
  }
}

private struct MobileAttachmentPreview: View {
  let attachment: VectorMessageAttachment
  @StateObject private var loader: MobileAttachmentLoader

  init(attachment: VectorMessageAttachment, viewModel: VectorMobileViewModel) {
    self.attachment = attachment
    self._loader = StateObject(
      wrappedValue: MobileAttachmentLoader(attachment: attachment, viewModel: viewModel)
    )
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      ZStack {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(Color.black.opacity(0.92))
          .aspectRatio(16 / 10, contentMode: .fit)
        if attachment.isImage, let url = loader.url {
          AsyncImage(url: url) { phase in
            if let image = phase.image {
              image
                .resizable()
                .scaledToFill()
            } else {
              ProgressView()
                .tint(.white)
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
          Image(systemName: attachment.isVideo ? "play.fill" : attachment.isAudio ? "waveform" : "doc")
            .font(.title2.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(.black.opacity(0.48), in: Circle())
        }
      }
      .clipped()

      Text(attachment.name)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
}

private struct MobileMediaViewer: View {
  let attachment: VectorMessageAttachment
  @Environment(\.dismiss) private var dismiss
  @StateObject private var loader: MobileAttachmentLoader

  init(attachment: VectorMessageAttachment, viewModel: VectorMobileViewModel) {
    self.attachment = attachment
    self._loader = StateObject(
      wrappedValue: MobileAttachmentLoader(attachment: attachment, viewModel: viewModel)
    )
  }

  var body: some View {
    NavigationStack {
      ZStack {
        Color.black.ignoresSafeArea()
        if let url = loader.url {
          if attachment.isVideo {
            VideoPlayer(player: AVPlayer(url: url))
              .aspectRatio(
                attachment.width.flatMap { width in
                  attachment.height.map { width / $0 }
                } ?? 16 / 9,
                contentMode: .fit
              )
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          } else if attachment.isImage {
            AsyncImage(url: url) { phase in
              if let image = phase.image {
                image
                  .resizable()
                  .scaledToFit()
              } else if phase.error != nil {
                ContentUnavailableView("Image unavailable", systemImage: "photo.badge.exclamationmark")
                  .foregroundStyle(.white)
              } else {
                ProgressView()
                  .tint(.white)
              }
            }
          } else {
            Link(destination: url) {
              Label("Open attachment", systemImage: "arrow.up.forward.app")
            }
            .buttonStyle(.borderedProminent)
          }
        } else if let error = loader.errorMessage {
          ContentUnavailableView(
            "Media unavailable",
            systemImage: "exclamationmark.triangle",
            description: Text(error)
          )
          .foregroundStyle(.white)
        } else {
          ProgressView()
            .tint(.white)
        }
      }
      .navigationTitle(attachment.name)
      .vectorInlineNavigationTitle()
      .mobileMediaToolbarStyle()
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button("Done") {
            dismiss()
          }
          .fontWeight(.semibold)
        }
      }
    }
  }
}

private struct MobileMessageComposer: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  var threadRootId: VectorID? = nil
  var replyToMessageId: VectorID? = nil
  @State private var bodyText = ""
  @State private var attachments: [VectorDraftAttachment] = []
  @State private var selectedPhoto: PhotosPickerItem?
  @State private var isPhotoPickerPresented = false
  @State private var isFileImporterPresented = false
  @FocusState private var isFocused: Bool

  private var mentionQuery: String? {
    guard let token = bodyText.split(whereSeparator: \.isWhitespace).last,
          token.hasPrefix("@")
    else { return nil }
    return String(token.dropFirst()).lowercased()
  }

  private var agentSuggestions: [VectorChannelAgentView] {
    guard let mentionQuery else { return [] }
    return viewModel.channelAgents.filter {
      mentionQuery.isEmpty
        || $0.agent.handle.localizedCaseInsensitiveContains(mentionQuery)
        || $0.agent.name.localizedCaseInsensitiveContains(mentionQuery)
    }
  }

  private var canSend: Bool {
    (!bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty)
      && !viewModel.isSendingChannelMessage
  }

  var body: some View {
    VStack(spacing: 0) {
      if !agentSuggestions.isEmpty {
        VStack(spacing: 0) {
          ForEach(agentSuggestions.prefix(4)) { agent in
            Button {
              insert(agent)
            } label: {
              HStack(spacing: 10) {
                Image(systemName: "cpu")
                  .foregroundStyle(VectorTheme.accent)
                  .frame(width: 28, height: 28)
                  .background(VectorTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 1) {
                  Text("@\(agent.agent.handle)")
                    .font(.subheadline.weight(.semibold))
                  Text("Agent · owned by \(agent.owner?.displayName ?? "workspace member")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                Circle()
                  .fill(agent.agent.lifecycleStatus == "ready" ? Color.green : Color.secondary)
                  .frame(width: 8, height: 8)
              }
              .padding(.horizontal, 14)
              .frame(minHeight: 48)
            }
            .buttonStyle(.plain)
            if agent.id != agentSuggestions.prefix(4).last?.id {
              Divider().padding(.leading, 52)
            }
          }
        }
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
      }

      if !attachments.isEmpty {
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(attachments, id: \.id) { attachment in
              HStack(spacing: 6) {
                Image(systemName: attachment.kind == "video" ? "video" : attachment.kind == "image" ? "photo" : "doc")
                Text(attachment.name)
                  .lineLimit(1)
                Button {
                  attachments.removeAll { $0.id == attachment.id }
                } label: {
                  Image(systemName: "xmark.circle.fill")
                }
                .accessibilityLabel("Remove \(attachment.name)")
              }
              .font(.caption)
              .padding(.horizontal, 9)
              .frame(height: 32)
              .background(Color.secondary.opacity(0.1), in: Capsule())
            }
          }
          .padding(.horizontal, 12)
          .padding(.top, 8)
        }
        .scrollIndicators(.hidden)
      }

      HStack(alignment: .bottom, spacing: 8) {
        Menu {
          Button {
            isPhotoPickerPresented = true
          } label: {
            Label("Photo or Video", systemImage: "photo.on.rectangle")
          }
          Button {
            isFileImporterPresented = true
          } label: {
            Label("File", systemImage: "doc")
          }
        } label: {
          Image(systemName: "plus")
            .font(.body.weight(.semibold))
            .frame(width: 36, height: 36)
            .background(Color.secondary.opacity(0.1), in: Circle())
        }
        .accessibilityLabel("Add attachment")

        TextField("Message", text: $bodyText, axis: .vertical)
          .lineLimit(1...5)
          .focused($isFocused)
          .textFieldStyle(.plain)
          .padding(.horizontal, 12)
          .padding(.vertical, 9)
          .background(
            VectorTheme.surfaceBackground,
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
          )
          .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .stroke(
                isFocused ? VectorTheme.accent : VectorTheme.border.opacity(0.82),
                lineWidth: isFocused ? 1.5 : 1
              )
          }
          .shadow(
            color: isFocused ? VectorTheme.accent.opacity(0.16) : Color.black.opacity(0.04),
            radius: isFocused ? 8 : 3,
            x: 0,
            y: isFocused ? 2 : 1
          )
          .animation(.easeOut(duration: 0.16), value: isFocused)

        Button {
          send()
        } label: {
          Group {
            if viewModel.isSendingChannelMessage {
              ProgressView()
                .controlSize(.small)
                .tint(.white)
            } else {
              Image(systemName: "arrow.up")
                .font(.body.weight(.bold))
            }
          }
          .frame(width: 36, height: 36)
          .foregroundStyle(.white)
          .background(canSend ? VectorTheme.accent : Color.secondary.opacity(0.28), in: Circle())
        }
        .disabled(!canSend)
        .accessibilityLabel("Send message")
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 9)
    }
    .photosPicker(
      isPresented: $isPhotoPickerPresented,
      selection: $selectedPhoto,
      matching: .any(of: [.images, .videos])
    )
    .fileImporter(
      isPresented: $isFileImporterPresented,
      allowedContentTypes: [.item],
      allowsMultipleSelection: false
    ) { result in
      guard case let .success(urls) = result, let url = urls.first else { return }
      let hasAccess = url.startAccessingSecurityScopedResource()
      defer {
        if hasAccess { url.stopAccessingSecurityScopedResource() }
      }
      guard let data = try? Data(contentsOf: url) else { return }
      attachments.append(
        VectorDraftAttachment(
          data: data,
          kind: "file",
          name: url.lastPathComponent,
          contentType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        )
      )
    }
    .onChange(of: selectedPhoto) { _, item in
      guard let item else { return }
      Task {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        let contentType = item.supportedContentTypes.first
        let isVideo = contentType?.conforms(to: .movie) == true
        attachments.append(
          VectorDraftAttachment(
            data: data,
            kind: isVideo ? "video" : "image",
            name: isVideo ? "video-\(attachments.count + 1).mov" : "image-\(attachments.count + 1).jpg",
            contentType: contentType?.preferredMIMEType ?? (isVideo ? "video/quicktime" : "image/jpeg")
          )
        )
        selectedPhoto = nil
      }
    }
  }

  private func insert(_ agent: VectorChannelAgentView) {
    let parts = bodyText.split(omittingEmptySubsequences: false, whereSeparator: \.isWhitespace)
    guard !parts.isEmpty else {
      bodyText = "@\(agent.agent.handle) "
      return
    }
    var mutable = parts.map(String.init)
    mutable[mutable.count - 1] = "@\(agent.agent.handle) "
    bodyText = mutable.joined(separator: " ")
    isFocused = true
  }

  private func send() {
    let pendingBody = bodyText
    let pendingAttachments = attachments
    Task {
      if await viewModel.sendChannelMessage(
        body: pendingBody,
        attachments: pendingAttachments,
        threadRootId: threadRootId,
        replyToMessageId: replyToMessageId
      ) {
        bodyText = ""
        attachments = []
      }
    }
  }
}

private struct MobileChannelDetailsSheet: View {
  let channel: VectorChannelListItem
  @ObservedObject var viewModel: VectorMobileViewModel
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        Section {
          VStack(spacing: 8) {
            Image(systemName: channel.channel.kind.systemImage)
              .font(.title2.weight(.semibold))
              .foregroundStyle(VectorTheme.accent)
              .frame(width: 52, height: 52)
              .background(VectorTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 15))
            Text(channel.channel.name)
              .font(.headline)
            if let topic = channel.channel.topic {
              Text(topic)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
        }

        Section("Notifications") {
          Label("Mentions and replies", systemImage: "bell")
        }

        Section("Agents") {
          if viewModel.channelAgents.isEmpty {
            Text("No agents are in this channel.")
              .foregroundStyle(.secondary)
          } else {
            ForEach(viewModel.channelAgents) { item in
              HStack(spacing: 10) {
                Image(systemName: "cpu")
                  .foregroundStyle(VectorTheme.accent)
                  .frame(width: 30, height: 30)
                  .background(VectorTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                  Text(item.agent.name)
                    .font(.subheadline.weight(.semibold))
                  Text("@\(item.agent.handle) · \(item.membership.wakeMode == "every_message" ? "every message" : "mentions")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                Circle()
                  .fill(item.agent.lifecycleStatus == "ready" ? Color.green : Color.secondary)
                  .frame(width: 9, height: 9)
                  .accessibilityLabel(item.agent.lifecycleStatus == "ready" ? "Ready" : "Offline")
              }
            }
          }
        }
      }
      .navigationTitle("Channel Details")
      .vectorInlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button("Done") {
            dismiss()
          }
          .fontWeight(.semibold)
        }
      }
    }
  }
}

struct MobileCollaborationSearchScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @State private var query = ""

  private var channelResults: [VectorChannelListItem] {
    guard !query.isEmpty else { return [] }
    return viewModel.collaborationChannels.filter {
      $0.channel.name.localizedCaseInsensitiveContains(query)
        || ($0.channel.topic?.localizedCaseInsensitiveContains(query) ?? false)
    }
  }

  private var workResults: [VectorWorkRow] {
    guard !query.isEmpty else { return [] }
    return viewModel.work.filter {
      $0.key.localizedCaseInsensitiveContains(query)
        || $0.title.localizedCaseInsensitiveContains(query)
    }
  }

  var body: some View {
    List {
      if query.isEmpty {
        ContentUnavailableView(
          "Search Vector",
          systemImage: "magnifyingglass",
          description: Text("Find channels, direct messages, and work in this workspace.")
        )
        .listRowBackground(Color.clear)
      } else {
        if !channelResults.isEmpty {
          Section("Conversations") {
            ForEach(channelResults) { item in
              NavigationLink {
                MobileChannelScreen(channel: item, viewModel: viewModel)
              } label: {
                MobileChannelRow(item: item)
              }
            }
          }
        }
        if !workResults.isEmpty {
          Section("Work") {
            ForEach(workResults) { work in
              NavigationLink {
                MobileWorkDetailScreen(work: work, viewModel: viewModel)
              } label: {
                VStack(alignment: .leading, spacing: 3) {
                  Text(work.title)
                    .font(.body.weight(.medium))
                  Text(work.key)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                }
              }
            }
          }
        }
        if channelResults.isEmpty && workResults.isEmpty {
          ContentUnavailableView.search(text: query)
            .listRowBackground(Color.clear)
        }
      }
    }
    .navigationTitle("Search")
    .searchable(text: $query, placement: .automatic, prompt: "Search Vector")
    .onAppear {
      viewModel.loadCollaboration()
    }
  }
}

struct MobileAgentsScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel

  var body: some View {
    List {
      if viewModel.channelAgents.isEmpty {
        ContentUnavailableView(
          "No active channel agents",
          systemImage: "cpu",
          description: Text("Open a channel to see its connected agents and wake behavior.")
        )
      } else {
        ForEach(viewModel.channelAgents) { item in
          VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 11) {
              Image(systemName: "cpu")
                .font(.headline)
                .foregroundStyle(VectorTheme.accent)
                .frame(width: 38, height: 38)
                .background(VectorTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 11))
              VStack(alignment: .leading, spacing: 2) {
                Text(item.agent.name)
                  .font(.body.weight(.semibold))
                Text("@\(item.agent.handle)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              Label(
                item.agent.lifecycleStatus == "ready" ? "Ready" : "Offline",
                systemImage: "circle.fill"
              )
              .font(.caption)
              .foregroundStyle(item.agent.lifecycleStatus == "ready" ? .green : .secondary)
            }
            if let description = item.agent.description {
              Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            LabeledContent("Owner", value: item.owner?.displayName ?? "Unknown")
              .font(.caption)
            LabeledContent(
              "Wakes on",
              value: item.membership.wakeMode == "every_message" ? "Every message" : "Mentions"
            )
            .font(.caption)
            LabeledContent("Working folder", value: item.agent.defaultFolder)
              .font(.caption)
          }
          .padding(.vertical, 5)
        }
      }
    }
    .navigationTitle("Agents")
  }
}

struct MobileMoreScreen: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  @ObservedObject var sessionController: VectorMobileSessionController
  @ObservedObject var pushCoordinator: VectorPushNotificationCoordinator

  var body: some View {
    List {
      Section {
        HStack(spacing: 12) {
          Image(systemName: "building.2")
            .font(.headline)
            .foregroundStyle(VectorTheme.accent)
            .frame(width: 40, height: 40)
            .background(VectorTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
          VStack(alignment: .leading, spacing: 2) {
            Text(viewModel.configuration.orgSlug)
              .font(.headline)
            Text(sessionController.user?.displayName ?? "Vector workspace")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        .padding(.vertical, 3)
      }

      Section("Collaboration") {
        NavigationLink {
          MobileAgentsScreen(viewModel: viewModel)
        } label: {
          Label("Agents", systemImage: "cpu")
        }
      }

      Section("Work") {
        NavigationLink {
          MobileRequestsScreen(viewModel: viewModel, sessionController: sessionController)
        } label: {
          Label("Requests", systemImage: "tray")
        }
        NavigationLink {
          MobileWorkScreen(viewModel: viewModel, sessionController: sessionController)
        } label: {
          Label("My Work", systemImage: "scope")
        }
        NavigationLink {
          IssuesScreen(viewModel: viewModel, sessionController: sessionController)
        } label: {
          Label("Issues", systemImage: "checklist")
        }
        NavigationLink {
          WorkspaceScreen(viewModel: viewModel)
        } label: {
          Label("Projects, Teams & Docs", systemImage: "square.grid.2x2")
        }
      }

      Section("Account") {
        NavigationLink {
          MobileSettingsScreen(
            viewModel: viewModel,
            sessionController: sessionController,
            pushCoordinator: pushCoordinator
          )
        } label: {
          Label("Settings", systemImage: "gearshape")
        }
        Link(destination: viewModel.configuration.workspaceWebURL) {
          Label("Open Vector on the web", systemImage: "safari")
        }
      }
    }
    .navigationTitle("More")
  }
}

private func messageTimestamp(_ milliseconds: Double) -> String {
  let date = Date(timeIntervalSince1970: milliseconds / 1000)
  return date.formatted(date: .omitted, time: .shortened)
}

private func smartReasonLabel(_ reason: String) -> String {
  switch reason {
  case "direct_message": "Direct message"
  case "mention": "Mention"
  case "thread_reply": "Reply to your thread"
  case "followed_thread": "Followed thread"
  default: "Priority"
  }
}

private extension View {
  @ViewBuilder
  func mobileMediaToolbarStyle() -> some View {
    #if os(iOS)
      self
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(.black.opacity(0.75), for: .navigationBar)
    #else
      self
    #endif
  }
}

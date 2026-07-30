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

  private var visibleConversations: [VectorChannelListItem] {
    let kindFiltered = viewModel.collaborationChannels.filter {
      directOnly ? $0.channel.kind.isDirect : true
    }
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    let searched = query.isEmpty
      ? kindFiltered
      : kindFiltered.filter {
        $0.channel.name.localizedCaseInsensitiveContains(query)
          || ($0.channel.topic?.localizedCaseInsensitiveContains(query) ?? false)
          || ($0.channel.description?.localizedCaseInsensitiveContains(query) ?? false)
      }

    return searched.sorted {
      let firstActivity = $0.channel.lastMessageAt ?? $0.channel.updatedAt
      let secondActivity = $1.channel.lastMessageAt ?? $1.channel.updatedAt
      if firstActivity == secondActivity {
        return $0.channel.name.localizedCaseInsensitiveCompare($1.channel.name) == .orderedAscending
      }
      return firstActivity > secondActivity
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
                HStack(spacing: 6) {
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
              }
              .scrollIndicators(.hidden)
              .listRowInsets(EdgeInsets(top: 3, leading: 16, bottom: 3, trailing: 0))
              .listRowSeparator(.hidden)
            }
          }

          Section {
            if visibleConversations.isEmpty {
              ContentUnavailableView(
                searchText.isEmpty
                  ? (directOnly ? "No direct messages" : "No conversations")
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
              ForEach(visibleConversations) { item in
                NavigationLink {
                  MobileChannelScreen(channel: item, viewModel: viewModel)
                } label: {
                  MobileChannelRow(item: item)
                }
                .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                .listRowSeparator(.hidden)
                .overlay(alignment: .bottom) {
                  Rectangle()
                    .fill(VectorTheme.border.opacity(0.28))
                    .frame(height: 0.5)
                    .padding(.horizontal, -16)
                    .allowsHitTesting(false)
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
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .searchable(
      text: $searchText,
      placement: .automatic,
      prompt: directOnly ? "Search direct messages" : "Search conversations"
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
    HStack(spacing: 6) {
      Image(systemName: systemImage)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
      Text(label)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.primary)
    }
    .padding(.horizontal, 11)
    .frame(minHeight: 38)
    .background(Color.secondary.opacity(0.075), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
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

  private var subtitle: String? {
    guard let topic = item.channel.topic?.trimmingCharacters(in: .whitespacesAndNewlines),
          !topic.isEmpty
    else { return nil }

    let genericDirectLabels = ["direct message", "group direct message"]
    if item.channel.kind.isDirect, genericDirectLabels.contains(topic.lowercased()) {
      return nil
    }
    return topic
  }

  var body: some View {
    HStack(spacing: 10) {
      ZStack {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(item.channel.kind.isDirect ? VectorTheme.accent.opacity(0.12) : Color.secondary.opacity(0.09))
        Image(systemName: item.channel.kind.systemImage)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(item.channel.kind.isDirect ? VectorTheme.accent : .secondary)
      }
      .frame(width: 32, height: 32)

      VStack(alignment: .leading, spacing: 2) {
        Text(item.channel.name)
          .font(.body.weight(item.unreadDisplayCount > 0 ? .semibold : .medium))
          .foregroundStyle(.primary)
          .lineLimit(1)
        if let subtitle {
          Text(subtitle)
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
    .frame(minHeight: 40)
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
      MobileMessageTimeline(viewModel: viewModel)

      MobileMessageComposer(viewModel: viewModel)
    }
    .navigationTitle(channel.channel.name)
    .vectorInlineNavigationTitle()
    #if os(iOS)
      .toolbar(.hidden, for: .tabBar)
      .background(MobileNavigationPopGestureBlocker())
    #endif
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
  @State private var replyTarget: VectorMessageView?

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(spacing: 0) {
            MobileMessageRow(
              message: rootMessage,
              viewModel: viewModel,
              showsThreadAction: false,
              mediaReplyThreadRootID: rootMessage.id,
              onReply: {
                replyTarget = rootMessage
              }
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
                  showsThreadAction: false,
                  mediaReplyThreadRootID: rootMessage.id,
                  onReply: {
                    replyTarget = reply
                  }
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

      if let replyTarget {
        HStack(spacing: 9) {
          Image(systemName: "arrowshape.turn.up.left")
            .foregroundStyle(VectorTheme.accent)
          VStack(alignment: .leading, spacing: 1) {
            Text(
              "Replying to \(replyTarget.authorUser?.displayName ?? replyTarget.authorAgent?.name ?? "message")"
            )
            .font(.caption.weight(.semibold))
            Text(replyTarget.message.body.isEmpty ? "Voice or file attachment" : replyTarget.message.body)
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Spacer()
          Button {
            self.replyTarget = nil
          } label: {
            Image(systemName: "xmark")
              .frame(width: 32, height: 32)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Cancel reply")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
      }

      MobileMessageComposer(
        viewModel: viewModel,
        threadRootId: rootMessage.id,
        replyToMessageId: replyTarget?.id ?? rootMessage.id,
        onSent: {
          replyTarget = nil
        }
      )
    }
    .navigationTitle("Thread")
    .vectorInlineNavigationTitle()
    #if os(iOS)
      .toolbar(.hidden, for: .tabBar)
      .background(MobileNavigationPopGestureBlocker())
    #endif
    .onAppear {
      viewModel.openThread(rootMessageId: rootMessage.id)
    }
  }
}

private struct MobileMessageRow: View {
  let message: VectorMessageView
  @ObservedObject var viewModel: VectorMobileViewModel
  var showsThreadAction = true
  var mediaReplyThreadRootID: VectorID?
  var onReply: (() -> Void)?
  @State private var selectedAttachment: VectorMessageAttachment?
  @State private var isShowingThread = false
  @State private var swipeOffset: CGFloat = 0
  @State private var isSwipeOpen = false
  @State private var isShowingReminderOptions = false
  @State private var isShowingCustomReminder = false
  @State private var customReminderDate = Date().addingTimeInterval(60 * 60)
  @State private var reminderNotice: MobileReminderNotice?

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

  private var isSending: Bool {
    viewModel.messageDeliveryState(for: message.id) == .sending
  }

  private var canSwipeToReply: Bool {
    showsThreadAction || onReply != nil
  }

  private var messageContentIndent: CGFloat {
    28
  }

  private var trailingSwipeWidth: CGFloat {
    196
  }

  private var reactionGroups: [MobileReactionGroup] {
    var order: [String] = []
    var reactionsByEmoji: [String: [VectorMessageReaction]] = [:]
    for reaction in message.reactions {
      if reactionsByEmoji[reaction.emoji] == nil {
        order.append(reaction.emoji)
      }
      reactionsByEmoji[reaction.emoji, default: []].append(reaction)
    }
    return order.compactMap { emoji in
      guard let reactions = reactionsByEmoji[emoji] else { return nil }
      return MobileReactionGroup(
        emoji: emoji,
        count: reactions.count,
        isActive: reactions.contains { $0.userId == viewModel.currentUser?.id }
      )
    }
  }

  var body: some View {
    ZStack(alignment: .trailing) {
      swipeActionTray

      VStack(alignment: .leading, spacing: 5) {
        HStack(alignment: .center, spacing: 7) {
          ZStack {
            Circle()
              .fill(
                message.authorAgent == nil
                  ? Color.secondary.opacity(0.11)
                  : VectorTheme.accent.opacity(0.14)
              )
            if message.authorAgent != nil {
              Image(systemName: "cpu")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(VectorTheme.accent)
            } else {
              Text(initials)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            }
          }
          .frame(width: 22, height: 22)
          .accessibilityHidden(true)

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
            .padding(.leading, messageContentIndent)
        } else if !message.message.body.isEmpty {
          Text(message.message.body)
            .font(.body)
            .foregroundStyle(.primary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, messageContentIndent)
        }

        if !message.attachments.isEmpty {
          LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 132, maximum: 260), spacing: 8)],
            alignment: .leading,
            spacing: 8
          ) {
            ForEach(message.attachments) { attachment in
              if attachment.isAudio {
                MobileAudioMessageAttachment(
                  attachment: attachment,
                  viewModel: viewModel
                )
              } else {
                Button {
                  selectedAttachment = attachment
                } label: {
                  MobileAttachmentPreview(attachment: attachment, viewModel: viewModel)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Preview \(attachment.name)")
              }
            }
          }
          .padding(.top, 2)
          .padding(.leading, messageContentIndent)
        }

        if let deliveryState = viewModel.messageDeliveryState(for: message.id),
           case let .failed(error) = deliveryState
        {
          Button {
            Task { await viewModel.retryChannelMessage(message.id) }
          } label: {
            Label(error, systemImage: "arrow.clockwise.circle.fill")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.red)
          }
          .buttonStyle(.plain)
          .accessibilityHint("Retries this message")
          .padding(.leading, messageContentIndent)
        }

        if message.message.deletedAt == nil, !reactionGroups.isEmpty {
          HStack(spacing: 6) {
            ForEach(reactionGroups) { reaction in
              Button {
                Task {
                  await viewModel.toggleReaction(message, emoji: reaction.emoji)
                }
              } label: {
                HStack(spacing: 4) {
                  Text(reaction.emoji)
                  Text("\(reaction.count)")
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                }
                .padding(.horizontal, 8)
                .frame(minHeight: 28)
                .background(
                  reaction.isActive
                    ? VectorTheme.accent.opacity(0.14)
                    : Color.secondary.opacity(0.09),
                  in: Capsule()
                )
                .overlay {
                  if reaction.isActive {
                    Capsule()
                      .stroke(VectorTheme.accent.opacity(0.45), lineWidth: 1)
                  }
                }
              }
              .buttonStyle(.plain)
              .disabled(isSending)
              .accessibilityLabel(
                "\(reaction.emoji), \(reaction.count) \(reaction.count == 1 ? "reaction" : "reactions")"
              )
            }
          }
          .padding(.leading, messageContentIndent)
        }

        if showsThreadAction && message.message.replyCount > 0 {
          Button {
            isShowingThread = true
          } label: {
            HStack(spacing: 5) {
              Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.caption2)
              Text(
                "\(Int(message.message.replyCount)) \(message.message.replyCount == 1 ? "reply" : "replies")"
              )
              Image(systemName: "chevron.right")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(VectorTheme.accent.opacity(0.72))
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(VectorTheme.accent)
            .padding(.horizontal, 8)
            .frame(height: 24)
            .background(VectorTheme.accent.opacity(0.10), in: Capsule())
          }
          .buttonStyle(.plain)
          .padding(.top, 1)
          .padding(.leading, messageContentIndent)
          .accessibilityLabel(
            "\(Int(message.message.replyCount)) \(message.message.replyCount == 1 ? "reply" : "replies"). Open thread."
          )
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
      .background(VectorTheme.surfaceBackground)
      .offset(x: swipeOffset)
      .shadow(
        color: Color.black.opacity(swipeOffset < 0 ? 0.14 : 0),
        radius: swipeOffset < 0 ? 5 : 0,
        x: 3,
        y: 0
      )
      .opacity(isSending ? 0.58 : 1)
      .animation(.easeOut(duration: 0.16), value: isSending)
      .accessibilityValue(isSending ? "Sending" : "")
      .simultaneousGesture(messageSwipeGesture)
      .onTapGesture {
        if isSwipeOpen {
          closeSwipeActions()
        }
      }
    }
    .clipped()
    .contextMenu {
      Button {
        #if os(iOS)
          UIPasteboard.general.string = message.message.body
        #endif
      } label: {
        Label("Copy text", systemImage: "doc.on.doc")
      }
      Button {
        activateReply()
      } label: {
        Label("Reply in thread", systemImage: "bubble.left.and.bubble.right")
      }
      Button {
        Task { await viewModel.toggleSaved(message) }
      } label: {
        Label(message.saved ? "Remove from saved" : "Save for later", systemImage: "bookmark")
      }
    }
    #if os(iOS)
      .fullScreenCover(item: $selectedAttachment) { attachment in
        mediaViewer(for: attachment)
      }
    #else
      .sheet(item: $selectedAttachment) { attachment in
        mediaViewer(for: attachment)
      }
    #endif
    .navigationDestination(isPresented: $isShowingThread) {
      MobileThreadScreen(rootMessage: message, viewModel: viewModel)
    }
    .confirmationDialog(
      "Remind me about this message",
      isPresented: $isShowingReminderOptions,
      titleVisibility: .visible
    ) {
      Button("In 20 minutes") {
        scheduleReminder(at: Date().addingTimeInterval(20 * 60))
      }
      Button("In 1 hour") {
        scheduleReminder(at: Date().addingTimeInterval(60 * 60))
      }
      Button("Tomorrow at 9:00 AM") {
        scheduleReminder(at: tomorrowMorning)
      }
      Button("Choose date & time…") {
        customReminderDate = Date().addingTimeInterval(60 * 60)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
          isShowingCustomReminder = true
        }
      }
      Button("Cancel", role: .cancel) {}
    }
    .sheet(isPresented: $isShowingCustomReminder) {
      NavigationStack {
        Form {
          DatePicker(
            "Remind me",
            selection: $customReminderDate,
            in: Date().addingTimeInterval(60)...,
            displayedComponents: [.date, .hourAndMinute]
          )
          .datePickerStyle(.compact)
        }
        .navigationTitle("Message reminder")
        .vectorInlineNavigationTitle()
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") {
              isShowingCustomReminder = false
            }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Schedule") {
              isShowingCustomReminder = false
              scheduleReminder(at: customReminderDate)
            }
          }
        }
      }
      .presentationDetents([.height(220)])
    }
    .alert(item: $reminderNotice) { notice in
      Alert(
        title: Text(notice.title),
        message: Text(notice.message),
        dismissButton: .default(Text("OK"))
      )
    }
  }

  private var swipeActionTray: some View {
    ZStack {
      HStack {
        Image(systemName: "arrowshape.turn.up.left.fill")
          .font(.body.weight(.semibold))
          .foregroundStyle(VectorTheme.accent)
          .frame(width: 42, height: 42)
          .background(VectorTheme.accent.opacity(0.14), in: Circle())
          .scaleEffect(swipeOffset >= 58 ? 1.08 : 0.9)
          .opacity(swipeOffset > 4 ? 1 : 0)
          .accessibilityHidden(true)
        Spacer()
      }
      .padding(.leading, 12)

      HStack(spacing: 8) {
        Spacer()
        Menu {
          ForEach(MobileReactionGroup.quickReactions) { reaction in
            Button {
              closeSwipeActions()
              Task {
                await viewModel.toggleReaction(message, emoji: reaction.emoji)
              }
            } label: {
              Text("\(reaction.emoji)  \(reaction.label)")
            }
          }
        } label: {
          Image(systemName: "face.smiling")
            .font(.body.weight(.semibold))
            .frame(width: 42, height: 42)
            .background(VectorTheme.accent.opacity(0.14), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(isSending || message.message.deletedAt != nil)
        .accessibilityLabel("React to message")

        Button {
          closeSwipeActions()
          Task { await viewModel.toggleSaved(message) }
        } label: {
          Image(systemName: message.saved ? "bookmark.fill" : "bookmark")
            .font(.body.weight(.semibold))
            .foregroundStyle(message.saved ? VectorTheme.accent : .primary)
            .frame(width: 42, height: 42)
            .background(
              message.saved
                ? VectorTheme.accent.opacity(0.16)
                : Color.primary.opacity(0.075),
              in: Circle()
            )
        }
        .buttonStyle(.plain)
        .disabled(isSending || message.message.deletedAt != nil)
        .accessibilityLabel(message.saved ? "Remove from saved" : "Save for later")

        Button {
          closeSwipeActions()
          isShowingReminderOptions = true
        } label: {
          Image(systemName: "bell.badge")
            .font(.body.weight(.semibold))
            .frame(width: 42, height: 42)
            .background(VectorTheme.accent.opacity(0.14), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(isSending || message.message.deletedAt != nil)
        .accessibilityLabel("Remind me about this message")

        Menu {
          Button {
            closeSwipeActions()
            activateReply()
          } label: {
            Label("Reply in thread", systemImage: "bubble.left.and.bubble.right")
          }
          Button {
            closeSwipeActions()
            #if os(iOS)
              UIPasteboard.general.string = message.message.body
            #endif
          } label: {
            Label("Copy text", systemImage: "doc.on.doc")
          }
        } label: {
          Image(systemName: "ellipsis")
            .font(.body.weight(.semibold))
            .frame(width: 42, height: 42)
            .background(Color.secondary.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("More message actions")
      }
      .padding(.trailing, 12)
      .accessibilityHidden(!isSwipeOpen)
    }
    .frame(maxHeight: .infinity)
    .background(VectorTheme.rowBackground)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(VectorTheme.border.opacity(0.18))
        .frame(height: 0.5)
    }
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(VectorTheme.border.opacity(0.18))
        .frame(height: 0.5)
    }
  }

  private var tomorrowMorning: Date {
    let calendar = Calendar.autoupdatingCurrent
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    return calendar.date(
      bySettingHour: 9,
      minute: 0,
      second: 0,
      of: tomorrow
    ) ?? tomorrow
  }

  private func scheduleReminder(at date: Date) {
    Task {
      let succeeded = await viewModel.scheduleMessageReminder(message, remindAt: date)
      if succeeded {
        let formatted = date.formatted(
          date: .abbreviated,
          time: .shortened
        )
        reminderNotice = MobileReminderNotice(
          title: "Reminder set",
          message: "Vector will notify you \(formatted)."
        )
        #if os(iOS)
          UIAccessibility.post(
            notification: .announcement,
            argument: "Reminder set for \(formatted)"
          )
        #endif
      } else {
        reminderNotice = MobileReminderNotice(
          title: "Couldn’t set reminder",
          message: "Check your connection and try again."
        )
      }
    }
  }

  private func mediaViewer(
    for attachment: VectorMessageAttachment
  ) -> some View {
    MobileMediaViewer(
      attachments: message.attachments,
      initialAttachmentID: attachment.id,
      authorName: authorName,
      createdAt: message.message.createdAt,
      threadRootID: mediaReplyThreadRootID,
      replyToMessageID: mediaReplyThreadRootID == nil ? nil : message.id,
      viewModel: viewModel
    )
  }

  private var messageSwipeGesture: some Gesture {
    DragGesture(minimumDistance: 12)
      .onChanged { value in
        guard abs(value.translation.width) > abs(value.translation.height) else { return }
        updateSwipeOffset(value.translation.width)
      }
      .onEnded { value in
        guard abs(value.translation.width) > abs(value.translation.height) else { return }
        finishSwipe(
          value.translation.width,
          value.predictedEndTranslation.width - value.translation.width
        )
      }
  }

  private func updateSwipeOffset(_ translationWidth: CGFloat) {
    let startingOffset: CGFloat = isSwipeOpen ? -trailingSwipeWidth : 0
    let maximumRightOffset: CGFloat = canSwipeToReply ? 84 : 0
    swipeOffset = min(
      maximumRightOffset,
      max(-trailingSwipeWidth, startingOffset + translationWidth)
    )
  }

  private func finishSwipe(_ translationWidth: CGFloat, _ velocityWidth: CGFloat) {
    let projectedTranslation = translationWidth + (velocityWidth * 0.14)
    let shouldReply = canSwipeToReply
      && (swipeOffset >= 58 || projectedTranslation >= 82)
    if shouldReply {
      withAnimation(.snappy(duration: 0.18)) {
        isSwipeOpen = false
        swipeOffset = 0
      }
      activateReply()
      return
    }
    let shouldOpen = swipeOffset < -48 || projectedTranslation < -72
    withAnimation(.snappy(duration: 0.22)) {
      isSwipeOpen = shouldOpen
      swipeOffset = shouldOpen ? -trailingSwipeWidth : 0
    }
  }

  private func closeSwipeActions() {
    withAnimation(.snappy(duration: 0.2)) {
      isSwipeOpen = false
      swipeOffset = 0
    }
  }

  private func activateReply() {
    if let onReply {
      onReply()
    } else {
      isShowingThread = true
    }
  }
}

private struct MobileReminderNotice: Identifiable {
  let id = UUID()
  let title: String
  let message: String
}

private struct MobileReactionGroup: Identifiable {
  static let quickReactions = [
    MobileQuickReaction(emoji: "👍", label: "Thumbs up"),
    MobileQuickReaction(emoji: "❤️", label: "Love"),
    MobileQuickReaction(emoji: "😂", label: "Laugh"),
    MobileQuickReaction(emoji: "🎉", label: "Celebrate"),
    MobileQuickReaction(emoji: "✅", label: "Done"),
    MobileQuickReaction(emoji: "👀", label: "Looking"),
  ]

  let emoji: String
  let count: Int
  let isActive: Bool

  var id: String { emoji }
}

private struct MobileQuickReaction: Identifiable {
  let emoji: String
  let label: String

  var id: String { emoji }
}

#if os(iOS)
private struct MobileNavigationPopGestureBlocker: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> Controller {
    Controller()
  }

  func updateUIViewController(_ controller: Controller, context: Context) {
    controller.blockInteractivePop()
  }

  static func dismantleUIViewController(
    _ controller: Controller,
    coordinator: Void
  ) {
    controller.restoreInteractivePop()
  }

  final class Controller: UIViewController {
    private weak var popGestureRecognizer: UIGestureRecognizer?
    private var previousIsEnabled = true

    override func viewDidLoad() {
      super.viewDidLoad()
      view.backgroundColor = .clear
      view.isUserInteractionEnabled = false
    }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      blockInteractivePop()
    }

    func blockInteractivePop() {
      DispatchQueue.main.async { [weak self] in
        guard let self,
              let recognizer = navigationController?.interactivePopGestureRecognizer
        else { return }
        if popGestureRecognizer !== recognizer {
          popGestureRecognizer = recognizer
          previousIsEnabled = recognizer.isEnabled
        }
        recognizer.isEnabled = false
      }
    }

    func restoreInteractivePop() {
      popGestureRecognizer?.isEnabled = previousIsEnabled
      popGestureRecognizer = nil
    }
  }
}
#endif

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
          .fill(attachment.isSticker ? Color.clear : Color.secondary.opacity(0.1))
          .aspectRatio(attachment.isSticker ? 1 : 16 / 10, contentMode: .fit)
        if attachment.isImage, let url = loader.url {
          AsyncImage(url: url) { phase in
            if let image = phase.image {
              image
                .resizable()
                .aspectRatio(contentMode: attachment.isSticker ? .fit : .fill)
            } else {
              ProgressView()
                .tint(.white)
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else if attachment.isVideo, let url = loader.url {
          MobileVideoThumbnail(url: url)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
          Image(
            systemName: attachment.isVideo
              ? "play.fill"
              : attachment.isAudio
                ? "waveform"
                : attachment.isImage ? "photo" : "doc"
          )
            .font(.title2.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(.black.opacity(0.48), in: Circle())
        }

        if attachment.isVideo {
          Image(systemName: "play.fill")
            .font(.body.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .background(.black.opacity(0.62), in: Circle())
            .overlay {
              Circle()
                .stroke(.white.opacity(0.22), lineWidth: 1)
            }
        }
      }
      .overlay(alignment: .topLeading) {
        if attachment.isVideo {
          Label("Video", systemImage: "video.fill")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .frame(height: 25)
            .background(.black.opacity(0.68), in: Capsule())
            .padding(8)
        }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(Color.secondary.opacity(0.24), lineWidth: 1)
      }
      .clipped()

      if !attachment.isSticker {
        Text(attachment.name)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
  }
}

@MainActor
private final class MobileVideoThumbnailLoader: ObservableObject {
  @Published private(set) var image: CGImage?

  func load(url: URL) async {
    let asset = AVURLAsset(url: url)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 720, height: 450)
    do {
      let result = try await generator.image(at: .zero)
      image = result.image
    } catch {
      image = nil
    }
  }
}

private struct MobileVideoThumbnail: View {
  let url: URL
  @StateObject private var loader = MobileVideoThumbnailLoader()

  var body: some View {
    Group {
      if let image = loader.image {
        Image(decorative: image, scale: 1)
          .resizable()
          .scaledToFill()
      } else {
        Rectangle()
          .fill(
            LinearGradient(
              colors: [
                Color.secondary.opacity(0.16),
                Color.secondary.opacity(0.06),
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )
      }
    }
    .aspectRatio(16 / 10, contentMode: .fit)
    .task(id: url) {
      await loader.load(url: url)
    }
  }
}

private struct MobileVoiceWaveform: View {
  let levels: [Double]
  var progress: Double = 0
  var live = false

  private var visibleLevels: [Double] {
    guard !levels.isEmpty else { return Array(repeating: 0.18, count: 26) }
    let targetCount = 30
    guard levels.count > targetCount else {
      return Array(repeating: 0.12, count: targetCount - levels.count) + levels
    }
    let step = Double(levels.count) / Double(targetCount)
    return (0..<targetCount).map { index in
      levels[min(Int(Double(index) * step), levels.count - 1)]
    }
  }

  var body: some View {
    HStack(alignment: .center, spacing: 2) {
      ForEach(Array(visibleLevels.enumerated()), id: \.offset) { index, level in
        Capsule()
          .fill(
            live || Double(index + 1) / Double(visibleLevels.count) <= progress
              ? VectorTheme.accent
              : Color.secondary.opacity(0.28)
          )
          .frame(width: 2.5, height: max(4, 24 * min(max(level, 0.08), 1)))
      }
    }
    .frame(height: 28)
    .accessibilityHidden(true)
  }
}

private struct MobileAudioMessageAttachment: View {
  let attachment: VectorMessageAttachment
  @StateObject private var loader: MobileAttachmentLoader
  @StateObject private var playback = VectorAudioPlaybackController()

  init(attachment: VectorMessageAttachment, viewModel: VectorMobileViewModel) {
    self.attachment = attachment
    self._loader = StateObject(
      wrappedValue: MobileAttachmentLoader(attachment: attachment, viewModel: viewModel)
    )
  }

  var body: some View {
    HStack(spacing: 10) {
      Button {
        playback.toggle()
      } label: {
        Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
          .font(.caption.weight(.bold))
          .foregroundStyle(.primary)
          .frame(width: 34, height: 34)
          .background(Color.secondary.opacity(0.1), in: Circle())
      }
      .buttonStyle(.plain)
      .disabled(playback.duration <= 0)
      .accessibilityLabel(playback.isPlaying ? "Pause voice message" : "Play voice message")

      VStack(alignment: .leading, spacing: 2) {
        MobileVoiceWaveform(
          levels: Array(repeating: 0.32, count: 30),
          progress: playback.progress
        )
        HStack {
          Text("Voice message")
          Spacer()
          Text(
            voiceDurationLabel(
              playback.duration > 0
                ? playback.duration
                : attachment.duration ?? 0
            )
          )
          .monospacedDigit()
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .frame(maxWidth: 300)
    .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 13))
    .task(id: loader.url) {
      guard let url = loader.url else { return }
      await playback.load(url: url)
    }
    .accessibilityElement(children: .contain)
  }
}

private enum MobileMentionSuggestion: Identifiable {
  case member(VectorUser)
  case agent(VectorChannelAgentView)

  var id: String {
    switch self {
    case let .member(user): "member:\(user.id)"
    case let .agent(agent): "agent:\(agent.id)"
    }
  }

  var handle: String {
    switch self {
    case let .member(user): user.mentionHandle
    case let .agent(agent): agent.agent.handle
    }
  }

  var displayName: String {
    switch self {
    case let .member(user): user.displayName
    case let .agent(agent): agent.agent.name
    }
  }
}

private struct MobileVoiceDraftPreview: View {
  let draft: VectorVoiceMemoDraft
  let onDelete: () -> Void
  let onSend: () -> Void
  @StateObject private var playback = VectorAudioPlaybackController()

  var body: some View {
    HStack(spacing: 10) {
      Button {
        playback.toggle()
      } label: {
        Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
          .font(.caption.weight(.bold))
          .frame(width: 36, height: 36)
          .background(Color.secondary.opacity(0.1), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(playback.isPlaying ? "Pause voice message" : "Play voice message")

      VStack(alignment: .leading, spacing: 2) {
        MobileVoiceWaveform(levels: draft.waveform, progress: playback.progress)
        Text(voiceDurationLabel(draft.duration))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Button(action: onDelete) {
        Image(systemName: "trash")
          .frame(width: 36, height: 36)
      }
      .buttonStyle(.plain)
      .foregroundStyle(.secondary)
      .accessibilityLabel("Delete voice message")

      Button(action: onSend) {
        Image(systemName: "arrow.up")
          .font(.body.weight(.bold))
          .foregroundStyle(.white)
          .frame(width: 36, height: 36)
          .background(VectorTheme.accent, in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Send voice message")
    }
    .onAppear {
      playback.load(data: draft.data)
    }
  }
}

private struct MobileLiveVoiceRecordingBar: View {
  @ObservedObject var recorder: VectorVoiceRecorder
  let gestureDecision: VectorVoiceGestureDecision
  let onDelete: () -> Void
  let onStop: () -> Void
  let onSend: () -> Void

  var body: some View {
    if recorder.phase == .locked {
      HStack(spacing: 10) {
        Button(action: onDelete) {
          Image(systemName: "trash")
            .frame(width: 38, height: 38)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.red)
        .accessibilityLabel("Delete voice recording")

        recordingStatus

        Button(action: onStop) {
          Image(systemName: "stop.fill")
            .font(.caption.weight(.bold))
            .frame(width: 38, height: 38)
            .background(Color.secondary.opacity(0.11), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Stop recording")

        Button(action: onSend) {
          Image(systemName: "arrow.up")
            .font(.body.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(VectorTheme.accent, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Stop and send voice message")
      }
    } else {
      HStack(spacing: 10) {
        recordingStatus

        Label(
          gestureDecision == .cancel
            ? "Release to cancel"
            : gestureDecision == .lock
              ? "Release to lock"
              : "Slide left · slide up",
          systemImage: gestureDecision == .cancel
            ? "xmark"
            : gestureDecision == .lock ? "lock.fill" : "arrow.left.and.right"
        )
        .font(.caption.weight(.medium))
        .foregroundStyle(
          gestureDecision == .cancel
            ? Color.red
            : gestureDecision == .lock ? VectorTheme.accent : Color.secondary
        )
        .lineLimit(1)
      }
    }
  }

  private var recordingStatus: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(.red)
        .frame(width: 8, height: 8)
        .accessibilityHidden(true)
      Text(voiceDurationLabel(recorder.elapsed))
        .font(.subheadline.monospacedDigit().weight(.medium))
      MobileVoiceWaveform(levels: recorder.waveform, live: true)
        .frame(maxWidth: .infinity)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Recording \(voiceDurationLabel(recorder.elapsed))")
  }
}

private struct MobileMessageComposer: View {
  @ObservedObject var viewModel: VectorMobileViewModel
  var threadRootId: VectorID? = nil
  var replyToMessageId: VectorID? = nil
  var onSent: (() -> Void)?
  @StateObject private var voiceRecorder = VectorVoiceRecorder()
  @State private var bodyText = ""
  @State private var attachments: [VectorDraftAttachment] = []
  @State private var selectedPhoto: PhotosPickerItem?
  @State private var isPhotoPickerPresented = false
  @State private var isFileImporterPresented = false
  @State private var showsFormatting = false
  @State private var composerSize: CGSize = .zero
  @State private var voiceGestureStarted = false
  @State private var voiceGestureDecision: VectorVoiceGestureDecision = .send
  @State private var isStartingVoiceRecording = false
  @FocusState private var isFocused: Bool

  private var mentionQuery: String? {
    guard let token = bodyText.split(whereSeparator: \.isWhitespace).last,
          token.hasPrefix("@")
    else { return nil }
    return String(token.dropFirst()).lowercased()
  }

  private var mentionSuggestions: [MobileMentionSuggestion] {
    guard let mentionQuery else { return [] }
    let members = viewModel.channelMembers
      .compactMap(\.user)
      .filter {
        mentionQuery.isEmpty
          || $0.mentionHandle.localizedCaseInsensitiveContains(mentionQuery)
          || $0.displayName.localizedCaseInsensitiveContains(mentionQuery)
      }
      .map(MobileMentionSuggestion.member)
    let agents = viewModel.channelAgents
      .filter {
        mentionQuery.isEmpty
          || $0.agent.handle.localizedCaseInsensitiveContains(mentionQuery)
          || $0.agent.name.localizedCaseInsensitiveContains(mentionQuery)
      }
      .map(MobileMentionSuggestion.agent)
    return members + agents
  }

  private var canSend: Bool {
    !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
  }

  var body: some View {
    VStack(spacing: 0) {
      mentionPicker

      if let errorMessage = voiceRecorder.errorMessage {
        HStack(spacing: 8) {
          Image(systemName: "exclamationmark.circle")
            .foregroundStyle(.red)
          Text(errorMessage)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
          #if os(iOS)
            if errorMessage.localizedCaseInsensitiveContains("Settings") {
              Button("Settings") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
              }
              .font(.caption.weight(.semibold))
            }
          #endif
          Button {
            voiceRecorder.clearError()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel("Dismiss voice recording error")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .transition(.opacity.combined(with: .move(edge: .bottom)))
      }

      attachmentStrip

      Group {
        switch voiceRecorder.phase {
        case let .preview(draft):
          MobileVoiceDraftPreview(
            draft: draft,
            onDelete: {
              voiceRecorder.clearPreview()
            },
            onSend: {
              sendVoiceDraft(draft)
            }
          )
        case .recording, .locked:
          MobileLiveVoiceRecordingBar(
            recorder: voiceRecorder,
            gestureDecision: voiceGestureDecision,
            onDelete: {
              cancelVoiceRecording()
            },
            onStop: {
              _ = voiceRecorder.stopForPreview()
            },
            onSend: {
              guard let draft = voiceRecorder.stopForPreview() else { return }
              sendVoiceDraft(draft)
            }
          )
        case .idle:
          messageRow
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)

      if showsFormatting, voiceRecorder.phase == .idle {
        formattingBar
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .coordinateSpace(name: "message-composer")
    .background {
      GeometryReader { proxy in
        Color.clear
          .onAppear { composerSize = proxy.size }
          .onChange(of: proxy.size) { _, size in composerSize = size }
      }
    }
    .background(VectorTheme.surfaceBackground)
    .overlay(alignment: .top) { Divider() }
    .animation(.easeOut(duration: 0.18), value: showsFormatting)
    .animation(.easeOut(duration: 0.18), value: voiceRecorder.phase)
    .simultaneousGesture(voiceGesture)
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
    .onDisappear {
      voiceRecorder.discard()
    }
  }

  @ViewBuilder
  private var mentionPicker: some View {
    if !mentionSuggestions.isEmpty {
      VStack(spacing: 0) {
        ForEach(Array(mentionSuggestions.prefix(5))) { suggestion in
          Button {
            insert(suggestion)
          } label: {
            HStack(spacing: 10) {
              Image(systemName: {
                if case .agent = suggestion { return "cpu" }
                return "person.fill"
              }())
                .foregroundStyle({
                  if case .agent = suggestion { return VectorTheme.accent }
                  return Color.secondary
                }())
                .frame(width: 28, height: 28)
                .background({
                  if case .agent = suggestion {
                    return VectorTheme.accent.opacity(0.1)
                  }
                  return Color.secondary.opacity(0.1)
                }(), in: RoundedRectangle(cornerRadius: 8))
              VStack(alignment: .leading, spacing: 1) {
                Text("@\(suggestion.handle)")
                  .font(.subheadline.weight(.semibold))
                Text({
                  switch suggestion {
                  case let .member(user):
                    return user.displayName
                  case let .agent(agent):
                    return "Agent · owned by \(agent.owner?.displayName ?? "workspace member")"
                  }
                }())
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              Spacer()
              if case let .agent(agent) = suggestion {
                Circle()
                  .fill(agent.agent.lifecycleStatus == "ready" ? Color.green : Color.secondary)
                  .frame(width: 8, height: 8)
              }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
          }
          .buttonStyle(.plain)
          if suggestion.id != mentionSuggestions.prefix(5).last?.id {
            Divider().padding(.leading, 52)
          }
        }
      }
      .background(.regularMaterial)
      .overlay(alignment: .top) { Divider() }
    }
  }

  @ViewBuilder
  private var attachmentStrip: some View {
    if !attachments.isEmpty {
      ScrollView(.horizontal) {
        HStack(spacing: 8) {
          ForEach(attachments, id: \.id) { attachment in
            HStack(spacing: 6) {
              #if os(iOS)
                if attachment.name.lowercased().hasPrefix("sticker-"),
                   let image = UIImage(data: attachment.data)
                {
                  Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 30, height: 30)
                    .accessibilityLabel("Sticker")
                } else {
                  Image(
                    systemName: attachment.kind == "video"
                      ? "video"
                      : attachment.kind == "image"
                        ? "photo"
                        : attachment.kind == "audio" ? "waveform" : "doc"
                  )
                  Text(attachment.name)
                    .lineLimit(1)
                }
              #else
                Image(
                  systemName: attachment.kind == "video"
                    ? "video"
                    : attachment.kind == "image"
                      ? "photo"
                      : attachment.kind == "audio" ? "waveform" : "doc"
                )
                Text(attachment.name)
                  .lineLimit(1)
              #endif
              Button {
                attachments.removeAll { $0.id == attachment.id }
              } label: {
                Image(systemName: "xmark.circle.fill")
              }
              .accessibilityLabel("Remove \(attachment.name)")
            }
            .font(.caption)
            .padding(.horizontal, 9)
            .frame(height: attachment.name.lowercased().hasPrefix("sticker-") ? 40 : 32)
            .background(Color.secondary.opacity(0.1), in: Capsule())
          }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
      }
      .scrollIndicators(.hidden)
    }
  }

  private var messageRow: some View {
    HStack(alignment: .center, spacing: 4) {
      Menu {
        Button {
          isPhotoPickerPresented = true
        } label: {
          Label("Photo or video", systemImage: "photo.on.rectangle")
        }
        Button {
          isFileImporterPresented = true
        } label: {
          Label("File", systemImage: "doc")
        }
        Button {
          insertMentionToken()
        } label: {
          Label("Mention someone", systemImage: "at")
        }
      } label: {
        Image(systemName: "plus")
          .font(.body.weight(.medium))
          .frame(width: 40, height: 40)
          .contentShape(Rectangle())
      }
      .accessibilityLabel("Add to message")

      VectorStickerTextEditor(
        text: $bodyText,
        isFocused: isFocused,
        onFocusChange: { isFocused = $0 },
        onSticker: addNativeSticker
      )

      Button {
        showsFormatting.toggle()
      } label: {
        Image(systemName: "textformat")
          .frame(width: 38, height: 40)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .foregroundStyle(showsFormatting ? VectorTheme.accent : .secondary)
      .accessibilityLabel(showsFormatting ? "Hide formatting" : "Show formatting")

      if canSend {
        Button {
          send()
        } label: {
          Image(systemName: "arrow.up")
            .font(.body.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(VectorTheme.accent, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Send message")
        .transition(.scale.combined(with: .opacity))
      } else {
        Image(systemName: isStartingVoiceRecording ? "ellipsis" : "mic.fill")
          .font(.body.weight(.semibold))
          .foregroundStyle(.secondary)
          .frame(width: 42, height: 42)
          .contentShape(Rectangle())
          .accessibilityElement()
          .accessibilityAddTraits(.isButton)
          .accessibilityLabel("Record voice message")
          .accessibilityHint("Press and hold. Slide left to cancel or up to lock.")
          .accessibilityAction {
            startAccessibleRecording()
          }
          .transition(.scale.combined(with: .opacity))
      }
    }
  }

  private var formattingBar: some View {
    HStack(spacing: 2) {
      formattingButton("bold", label: "Bold", prefix: "**", suffix: "**")
      formattingButton("italic", label: "Italic", prefix: "_", suffix: "_")
      formattingButton("chevron.left.forwardslash.chevron.right", label: "Code", prefix: "`", suffix: "`")
      Button {
        insertMentionToken()
      } label: {
        Image(systemName: "at")
          .frame(width: 38, height: 34)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Mention someone")
      Spacer()
      Text("Hold \(Image(systemName: "mic.fill")) for voice")
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 12)
    .padding(.bottom, 8)
  }

  private var voiceGesture: some Gesture {
    DragGesture(minimumDistance: 0, coordinateSpace: .named("message-composer"))
      .onChanged { value in
        if !voiceGestureStarted {
          guard !canSend,
                voiceRecorder.phase == .idle,
                value.startLocation.x >= composerSize.width - 76,
                value.startLocation.y >= composerSize.height - 74
          else { return }
          voiceGestureStarted = true
          voiceGestureDecision = .send
          beginVoiceRecording()
        }
        guard voiceGestureStarted else { return }
        voiceGestureDecision = VectorVoiceGestureDecision.resolve(
          horizontalTranslation: value.translation.width,
          verticalTranslation: value.translation.height
        )
        if voiceGestureDecision == .lock {
          voiceRecorder.lock()
        }
      }
      .onEnded { _ in
        guard voiceGestureStarted else { return }
        let decision = voiceGestureDecision
        voiceGestureStarted = false
        finishVoiceGesture(decision)
      }
  }

  private func formattingButton(
    _ systemName: String,
    label: String,
    prefix: String,
    suffix: String
  ) -> some View {
    Button {
      applyFormatting(prefix: prefix, suffix: suffix)
    } label: {
      Image(systemName: systemName)
        .frame(width: 38, height: 34)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }

  private func applyFormatting(prefix: String, suffix: String) {
    if bodyText.isEmpty {
      bodyText = prefix + suffix
    } else {
      bodyText = prefix + bodyText + suffix
    }
    isFocused = true
  }

  private func insertMentionToken() {
    if !bodyText.isEmpty, !bodyText.last!.isWhitespace {
      bodyText += " "
    }
    bodyText += "@"
    isFocused = true
  }

  private func addNativeSticker(data: Data, name: String, contentType: String) {
    #if os(iOS)
      let image = UIImage(data: data)
      attachments.append(
        VectorDraftAttachment(
          data: data,
          kind: "image",
          name: name,
          contentType: contentType,
          width: image.map { Double($0.size.width * $0.scale) },
          height: image.map { Double($0.size.height * $0.scale) }
        )
      )
      UINotificationFeedbackGenerator().notificationOccurred(.success)
    #endif
  }

  private func insert(_ suggestion: MobileMentionSuggestion) {
    let parts = bodyText.split(omittingEmptySubsequences: false, whereSeparator: \.isWhitespace)
    guard !parts.isEmpty else {
      bodyText = "@\(suggestion.handle) "
      return
    }
    var mutable = parts.map(String.init)
    mutable[mutable.count - 1] = "@\(suggestion.handle) "
    bodyText = mutable.joined(separator: " ")
    isFocused = true
  }

  private func beginVoiceRecording() {
    guard !isStartingVoiceRecording else { return }
    isFocused = false
    showsFormatting = false
    voiceRecorder.clearError()
    isStartingVoiceRecording = true
    Task {
      let started = await voiceRecorder.start()
      isStartingVoiceRecording = false
      if started, !voiceGestureStarted, voiceRecorder.phase == .recording {
        voiceRecorder.discard()
      }
    }
  }

  private func startAccessibleRecording() {
    guard voiceRecorder.phase == .idle, !isStartingVoiceRecording else { return }
    isFocused = false
    showsFormatting = false
    isStartingVoiceRecording = true
    Task {
      let started = await voiceRecorder.start()
      isStartingVoiceRecording = false
      if started {
        voiceRecorder.lock()
      }
    }
  }

  private func finishVoiceGesture(_ decision: VectorVoiceGestureDecision) {
    guard voiceRecorder.isRecording else { return }
    switch decision {
    case .cancel:
      cancelVoiceRecording()
    case .lock:
      voiceRecorder.lock()
    case .send:
      guard let draft = voiceRecorder.stopForPreview() else { return }
      sendVoiceDraft(draft)
    }
  }

  private func cancelVoiceRecording() {
    voiceRecorder.discard()
    #if os(iOS)
      UINotificationFeedbackGenerator().notificationOccurred(.warning)
    #endif
  }

  private func sendVoiceDraft(_ draft: VectorVoiceMemoDraft) {
    let pendingBody = bodyText
    let pendingAttachments = attachments + [draft.attachment]
    bodyText = ""
    attachments = []
    voiceRecorder.clearPreview()
    onSent?()
    Task {
      _ = await viewModel.sendChannelMessage(
        body: pendingBody,
        attachments: pendingAttachments,
        threadRootId: threadRootId,
        replyToMessageId: replyToMessageId
      )
    }
  }

  private func send() {
    let pendingBody = bodyText
    let pendingAttachments = attachments
    guard !pendingBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !pendingAttachments.isEmpty
    else { return }
    bodyText = ""
    attachments = []
    onSent?()
    Task {
      _ = await viewModel.sendChannelMessage(
        body: pendingBody,
        attachments: pendingAttachments,
        threadRootId: threadRootId,
        replyToMessageId: replyToMessageId
      )
    }
  }
}

private func voiceDurationLabel(_ duration: TimeInterval) -> String {
  let totalSeconds = max(Int(duration.rounded(.down)), 0)
  return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
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

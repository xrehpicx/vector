import AVKit
import Combine
import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
  import PencilKit
  import QuickLook
  import UIKit
#endif

struct MobileMediaViewer: View {
  let attachments: [VectorMessageAttachment]
  let authorName: String
  let createdAt: Double
  let threadRootID: VectorID?
  let replyToMessageID: VectorID?
  let viewModel: VectorMobileViewModel

  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var selectedAttachmentID: VectorID
  @State private var isChromeVisible = true
  @State private var isPresentingMarkup = false
  @StateObject private var loader: MobileViewerURLLoader

  init(
    attachments: [VectorMessageAttachment],
    initialAttachmentID: VectorID,
    authorName: String,
    createdAt: Double,
    threadRootID: VectorID?,
    replyToMessageID: VectorID?,
    viewModel: VectorMobileViewModel
  ) {
    let availableAttachments = attachments.isEmpty
      ? []
      : attachments
    self.attachments = availableAttachments
    self.authorName = authorName
    self.createdAt = createdAt
    self.threadRootID = threadRootID
    self.replyToMessageID = replyToMessageID
    self.viewModel = viewModel
    self._selectedAttachmentID = State(initialValue: initialAttachmentID)
    self._loader = StateObject(
      wrappedValue: MobileViewerURLLoader(
        attachments: availableAttachments,
        viewModel: viewModel
      )
    )
  }

  private var selectedAttachment: VectorMessageAttachment? {
    attachments.first { $0.id == selectedAttachmentID } ?? attachments.first
  }

  private var selectedIndex: Int {
    guard let selectedAttachment else { return 0 }
    return attachments.firstIndex(where: { $0.id == selectedAttachment.id }) ?? 0
  }

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()

      if attachments.isEmpty {
        ContentUnavailableView(
          "Attachment unavailable",
          systemImage: "doc.badge.exclamationmark"
        )
        .foregroundStyle(.white)
      } else {
        attachmentPager
      }

      if isChromeVisible, let attachment = selectedAttachment {
        viewerChrome(attachment)
          .transition(.opacity)
      }
    }
    .preferredColorScheme(.dark)
    #if os(iOS)
      .statusBarHidden(!isChromeVisible)
    #endif
    .onTapGesture {
      withAnimation(.easeOut(duration: 0.16)) {
        isChromeVisible.toggle()
      }
    }
    .task {
      await loader.loadAll()
    }
    #if os(iOS)
      .fullScreenCover(isPresented: $isPresentingMarkup) {
        if let attachment = selectedAttachment,
           let remoteURL = loader.urls[attachment.id]
        {
          MobileImageMarkupScreen(
            remoteURL: remoteURL,
            sourceName: attachment.name,
            onSend: { draft in
              isPresentingMarkup = false
              Task {
                _ = await viewModel.sendChannelMessage(
                  body: "",
                  attachments: [draft],
                  threadRootId: threadRootID,
                  replyToMessageId: replyToMessageID
                )
              }
              dismiss()
            }
          )
        }
      }
    #endif
  }

  @ViewBuilder
  private var attachmentPager: some View {
    let pager = TabView(selection: $selectedAttachmentID) {
      ForEach(attachments) { attachment in
        MobileMediaPage(
          attachment: attachment,
          remoteURL: loader.urls[attachment.id],
          errorMessage: loader.errors[attachment.id]
        )
        .tag(attachment.id)
      }
    }
    #if os(iOS)
      pager.tabViewStyle(.page(indexDisplayMode: .never))
    #else
      pager
    #endif
  }

  @ViewBuilder
  private func viewerChrome(_ attachment: VectorMessageAttachment) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        Button {
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.subheadline.weight(.semibold))
            .frame(width: 38, height: 38)
            .background(.ultraThinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close media viewer")

        VStack(alignment: .leading, spacing: 1) {
          Text(authorName)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
          Text(viewerTimestamp(createdAt))
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.66))
        }

        Spacer(minLength: 8)

        if attachments.count > 1 {
          Text("\(selectedIndex + 1) of \(attachments.count)")
            .font(.caption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(.white.opacity(0.76))
        }

        if let url = loader.urls[attachment.id] {
          #if os(iOS)
            if attachment.isImage {
              Button {
                isPresentingMarkup = true
              } label: {
                Image(systemName: "pencil.tip")
                  .font(.subheadline.weight(.semibold))
                  .frame(width: 38, height: 38)
                  .background(.ultraThinMaterial, in: Circle())
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Mark up image")
            }
          #endif

          ShareLink(item: url) {
            Image(systemName: "square.and.arrow.up")
              .font(.subheadline.weight(.semibold))
              .frame(width: 38, height: 38)
              .background(.ultraThinMaterial, in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Share \(attachment.name)")

          Menu {
            ShareLink(item: url) {
              Label("Share or save", systemImage: "square.and.arrow.up")
            }
            Button {
              openURL(url)
            } label: {
              Label("Open in another app", systemImage: "arrow.up.forward.app")
            }
          } label: {
            Image(systemName: "ellipsis")
              .font(.subheadline.weight(.semibold))
              .frame(width: 38, height: 38)
              .background(.ultraThinMaterial, in: Circle())
          }
          .accessibilityLabel("More media actions")
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 8)
      .padding(.bottom, 34)
      .background(
        LinearGradient(
          colors: [.black.opacity(0.8), .black.opacity(0)],
          startPoint: .top,
          endPoint: .bottom
        )
        .ignoresSafeArea(edges: .top)
      )

      Spacer()

      VStack(spacing: 5) {
        Text(attachment.name)
          .font(.subheadline.weight(.medium))
          .lineLimit(1)
        Text(viewerMetadata(attachment))
          .font(.caption2)
          .foregroundStyle(.white.opacity(0.64))
      }
      .frame(maxWidth: .infinity)
      .padding(.horizontal, 20)
      .padding(.top, 32)
      .padding(.bottom, 12)
      .background(
        LinearGradient(
          colors: [.black.opacity(0), .black.opacity(0.78)],
          startPoint: .top,
          endPoint: .bottom
        )
        .ignoresSafeArea(edges: .bottom)
      )
    }
    .foregroundStyle(.white)
    .allowsHitTesting(true)
  }
}

@MainActor
private final class MobileViewerURLLoader: ObservableObject {
  @Published private(set) var urls: [VectorID: URL] = [:]
  @Published private(set) var errors: [VectorID: String] = [:]

  private let attachments: [VectorMessageAttachment]
  private let viewModel: VectorMobileViewModel
  private var cancellables: [VectorID: AnyCancellable] = [:]

  init(
    attachments: [VectorMessageAttachment],
    viewModel: VectorMobileViewModel
  ) {
    self.attachments = attachments
    self.viewModel = viewModel
  }

  func loadAll() async {
    for attachment in attachments where urls[attachment.id] == nil {
      load(attachment)
    }
  }

  private func load(_ attachment: VectorMessageAttachment) {
    cancellables[attachment.id] = viewModel.attachmentURL(attachment.id)
      .receive(on: DispatchQueue.main)
      .sink(
        receiveCompletion: { [weak self] completion in
          if case let .failure(error) = completion {
            self?.errors[attachment.id] = error.localizedDescription
          }
        },
        receiveValue: { [weak self] result in
          guard let self else { return }
          if let rawURL = result?.url, let url = URL(string: rawURL) {
            self.urls[attachment.id] = url
            self.errors[attachment.id] = nil
          } else {
            self.errors[attachment.id] = "The attachment URL is no longer available."
          }
        }
      )
  }
}

private struct MobileMediaPage: View {
  let attachment: VectorMessageAttachment
  let remoteURL: URL?
  let errorMessage: String?

  var body: some View {
    Group {
      if let remoteURL {
        if attachment.isImage {
          MobileZoomableRemoteImage(url: remoteURL)
        } else if attachment.isVideo {
          MobileNativeVideoPage(url: remoteURL)
        } else if attachment.isAudio {
          MobileNativeAudioPage(
            url: remoteURL,
            fallbackDuration: attachment.duration ?? 0
          )
        } else {
          MobileNativeDocumentPage(
            attachment: attachment,
            remoteURL: remoteURL
          )
        }
      } else if let errorMessage {
        ContentUnavailableView(
          "Media unavailable",
          systemImage: "exclamationmark.triangle",
          description: Text(errorMessage)
        )
        .foregroundStyle(.white)
      } else {
        ProgressView()
          .controlSize(.large)
          .tint(.white)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct MobileZoomableRemoteImage: View {
  let url: URL
  @State private var scale: CGFloat = 1
  @State private var settledScale: CGFloat = 1
  @State private var offset: CGSize = .zero
  @State private var settledOffset: CGSize = .zero

  var body: some View {
    AsyncImage(url: url) { phase in
      if let image = phase.image {
        image
          .resizable()
          .scaledToFit()
          .scaleEffect(scale)
          .offset(offset)
          .gesture(zoomGesture)
          .simultaneousGesture(panGesture)
          .onTapGesture(count: 2) {
            withAnimation(.snappy(duration: 0.22)) {
              if scale > 1 {
                scale = 1
                settledScale = 1
                offset = .zero
                settledOffset = .zero
              } else {
                scale = 2
                settledScale = 2
              }
            }
          }
          .accessibilityLabel("Image preview")
          .accessibilityHint("Pinch to zoom or double tap")
      } else if phase.error != nil {
        ContentUnavailableView(
          "Image unavailable",
          systemImage: "photo.badge.exclamationmark"
        )
        .foregroundStyle(.white)
      } else {
        ProgressView()
          .controlSize(.large)
          .tint(.white)
      }
    }
  }

  private var zoomGesture: some Gesture {
    MagnificationGesture()
      .onChanged { value in
        scale = min(max(settledScale * value, 1), 5)
      }
      .onEnded { _ in
        settledScale = scale
        if scale <= 1 {
          withAnimation(.snappy(duration: 0.2)) {
            offset = .zero
            settledOffset = .zero
          }
        }
      }
  }

  private var panGesture: some Gesture {
    DragGesture()
      .onChanged { value in
        guard scale > 1 else { return }
        offset = CGSize(
          width: settledOffset.width + value.translation.width,
          height: settledOffset.height + value.translation.height
        )
      }
      .onEnded { _ in
        settledOffset = offset
      }
  }
}

private struct MobileNativeVideoPage: View {
  let url: URL
  @State private var player: AVPlayer

  init(url: URL) {
    self.url = url
    self._player = State(initialValue: AVPlayer(url: url))
  }

  var body: some View {
    VideoPlayer(player: player)
      .onAppear {
        player.play()
      }
      .onDisappear {
        player.pause()
      }
      .accessibilityLabel("Video player")
  }
}

private struct MobileNativeAudioPage: View {
  let url: URL
  let fallbackDuration: Double
  @StateObject private var playback = VectorAudioPlaybackController()
  @State private var scrubberValue: Double = 0
  @State private var isScrubbing = false

  private var duration: Double {
    playback.duration > 0 ? playback.duration : fallbackDuration
  }

  var body: some View {
    VStack(spacing: 28) {
      Image(systemName: "waveform.circle.fill")
        .font(.system(size: 92, weight: .regular))
        .foregroundStyle(.white.opacity(0.92), Color.white.opacity(0.12))

      VStack(spacing: 10) {
        Slider(
          value: Binding(
            get: { isScrubbing ? scrubberValue : playback.progress },
            set: { scrubberValue = $0 }
          ),
          in: 0...1,
          onEditingChanged: { editing in
            isScrubbing = editing
            if !editing {
              playback.seek(to: scrubberValue)
            }
          }
        )
        .tint(.white)

        HStack {
          Text(mediaDurationLabel(duration * (isScrubbing ? scrubberValue : playback.progress)))
          Spacer()
          Text("-\(mediaDurationLabel(max(0, duration * (1 - (isScrubbing ? scrubberValue : playback.progress)))))")
        }
        .font(.caption.monospacedDigit())
        .foregroundStyle(.white.opacity(0.66))
      }

      Button {
        playback.toggle()
      } label: {
        Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
          .font(.title2.weight(.bold))
          .frame(width: 64, height: 64)
          .background(.white, in: Circle())
          .foregroundStyle(.black)
      }
      .buttonStyle(.plain)
      .disabled(playback.duration <= 0)
      .accessibilityLabel(playback.isPlaying ? "Pause audio" : "Play audio")
    }
    .padding(.horizontal, 34)
    .task(id: url) {
      await playback.load(url: url)
    }
  }
}

private struct MobileNativeDocumentPage: View {
  let attachment: VectorMessageAttachment
  let remoteURL: URL
  @StateObject private var downloader = MobileDocumentDownloader()

  var body: some View {
    Group {
      if let localURL = downloader.localURL {
        #if os(iOS)
          MobileQuickLookPreview(url: localURL)
            .background(Color(white: 0.08))
        #else
          Link(destination: localURL) {
            Label("Open \(attachment.name)", systemImage: documentIcon)
          }
          .buttonStyle(.borderedProminent)
        #endif
      } else if let errorMessage = downloader.errorMessage {
        ContentUnavailableView(
          "Preview unavailable",
          systemImage: "doc.badge.exclamationmark",
          description: Text(errorMessage)
        )
        .foregroundStyle(.white)
      } else {
        VStack(spacing: 14) {
          Image(systemName: documentIcon)
            .font(.system(size: 52))
            .foregroundStyle(.white.opacity(0.82))
          ProgressView()
            .tint(.white)
          Text("Preparing preview")
            .font(.caption)
            .foregroundStyle(.white.opacity(0.62))
        }
      }
    }
    .task(id: remoteURL) {
      await downloader.load(remoteURL: remoteURL, name: attachment.name)
    }
  }

  private var documentIcon: String {
    let pathExtension = (attachment.name as NSString).pathExtension.lowercased()
    if attachment.contentType == "application/pdf" || pathExtension == "pdf" {
      return "doc.richtext"
    }
    if ["doc", "docx", "pages", "rtf"].contains(pathExtension) {
      return "doc.text"
    }
    if ["xls", "xlsx", "numbers", "csv"].contains(pathExtension) {
      return "tablecells"
    }
    if ["ppt", "pptx", "key"].contains(pathExtension) {
      return "rectangle.on.rectangle.angled"
    }
    if ["zip", "gz", "tar"].contains(pathExtension) {
      return "doc.zipper"
    }
    return "doc"
  }
}

@MainActor
private final class MobileDocumentDownloader: ObservableObject {
  @Published private(set) var localURL: URL?
  @Published private(set) var errorMessage: String?

  func load(remoteURL: URL, name: String) async {
    if localURL != nil { return }
    do {
      let (temporaryURL, response) = try await URLSession.shared.download(from: remoteURL)
      if let httpResponse = response as? HTTPURLResponse,
         !(200..<300).contains(httpResponse.statusCode)
      {
        throw URLError(.badServerResponse)
      }
      let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent("vector-media-preview", isDirectory: true)
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true
      )
      let sanitizedName = name.replacingOccurrences(of: "/", with: "-")
      let destination = directory.appendingPathComponent(
        "\(UUID().uuidString)-\(sanitizedName)"
      )
      try FileManager.default.moveItem(at: temporaryURL, to: destination)
      localURL = destination
      errorMessage = nil
    } catch {
      errorMessage = "Vector couldn’t prepare this file for preview."
    }
  }
}

#if os(iOS)
private struct MobileImageMarkupScreen: View {
  let remoteURL: URL
  let sourceName: String
  let onSend: (VectorDraftAttachment) -> Void

  @Environment(\.dismiss) private var dismiss
  @StateObject private var sourceLoader = MobileMarkupSourceLoader()
  @StateObject private var markupController = MobileImageMarkupController()

  var body: some View {
    NavigationStack {
      ZStack {
        Color.black.ignoresSafeArea()
        if let image = sourceLoader.image {
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .accessibilityHidden(true)

          MobileMarkupCanvas(controller: markupController)
            .background(Color.clear)
            .accessibilityLabel("Image markup canvas")
        } else if let errorMessage = sourceLoader.errorMessage {
          ContentUnavailableView(
            "Image unavailable",
            systemImage: "photo.badge.exclamationmark",
            description: Text(errorMessage)
          )
          .foregroundStyle(.white)
        } else {
          VStack(spacing: 12) {
            ProgressView()
              .controlSize(.large)
              .tint(.white)
            Text("Preparing image")
              .font(.caption)
              .foregroundStyle(.white.opacity(0.64))
          }
        }
      }
      .navigationTitle("Mark up")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(.black.opacity(0.82), for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .toolbarColorScheme(.dark, for: .navigationBar)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            dismiss()
          }
        }
        ToolbarItemGroup(placement: .primaryAction) {
          Button {
            markupController.undo()
          } label: {
            Image(systemName: "arrow.uturn.backward")
          }
          .disabled(!markupController.canUndo)
          .accessibilityLabel("Undo")

          Button {
            markupController.redo()
          } label: {
            Image(systemName: "arrow.uturn.forward")
          }
          .disabled(!markupController.canRedo)
          .accessibilityLabel("Redo")

          Button("Send") {
            sendMarkedUpImage()
          }
          .fontWeight(.semibold)
          .disabled(sourceLoader.image == nil)
        }
      }
    }
    .task(id: remoteURL) {
      await sourceLoader.load(url: remoteURL)
      if let image = sourceLoader.image {
        markupController.setImage(image)
      }
    }
  }

  private func sendMarkedUpImage() {
    guard let renderedImage = markupController.renderedImage(),
          let data = renderedImage.pngData()
    else {
      return
    }
    let baseName = (sourceName as NSString).deletingPathExtension
    onSend(
      VectorDraftAttachment(
        data: data,
        kind: "image",
        name: "annotated-\(baseName).png",
        contentType: "image/png",
        width: Double(renderedImage.size.width * renderedImage.scale),
        height: Double(renderedImage.size.height * renderedImage.scale)
      )
    )
  }
}

@MainActor
private final class MobileMarkupSourceLoader: ObservableObject {
  @Published private(set) var image: UIImage?
  @Published private(set) var errorMessage: String?

  func load(url: URL) async {
    do {
      let (data, response) = try await URLSession.shared.data(from: url)
      if let httpResponse = response as? HTTPURLResponse,
         !(200..<300).contains(httpResponse.statusCode)
      {
        throw URLError(.badServerResponse)
      }
      guard let image = UIImage(data: data) else {
        throw URLError(.cannotDecodeContentData)
      }
      self.image = image
      errorMessage = nil
    } catch {
      errorMessage = "Vector couldn’t prepare this image for markup."
    }
  }
}

@MainActor
private final class MobileImageMarkupController: NSObject, ObservableObject {
  @Published private(set) var canUndo = false
  @Published private(set) var canRedo = false

  weak var canvasView: PKCanvasView?
  var toolPicker: PKToolPicker?
  private var image: UIImage?

  func setImage(_ image: UIImage) {
    self.image = image
  }

  func attach(canvasView: PKCanvasView) {
    self.canvasView = canvasView
    canvasView.drawingPolicy = .anyInput
    canvasView.backgroundColor = .clear
    canvasView.isOpaque = false
    canvasView.delegate = self
    let toolPicker = PKToolPicker()
    self.toolPicker = toolPicker
    toolPicker.addObserver(canvasView)
    toolPicker.setVisible(true, forFirstResponder: canvasView)
    DispatchQueue.main.async {
      canvasView.becomeFirstResponder()
    }
    updateUndoState()
  }

  func undo() {
    canvasView?.undoManager?.undo()
    updateUndoState()
  }

  func redo() {
    canvasView?.undoManager?.redo()
    updateUndoState()
  }

  func renderedImage() -> UIImage? {
    guard let image, let canvasView else { return nil }
    let canvasBounds = canvasView.bounds
    guard canvasBounds.width > 0, canvasBounds.height > 0 else { return nil }

    let imageAspect = image.size.width / max(image.size.height, 1)
    let canvasAspect = canvasBounds.width / max(canvasBounds.height, 1)
    let imageRect: CGRect
    if canvasAspect > imageAspect {
      let height = canvasBounds.height
      let width = height * imageAspect
      imageRect = CGRect(
        x: (canvasBounds.width - width) / 2,
        y: 0,
        width: width,
        height: height
      )
    } else {
      let width = canvasBounds.width
      let height = width / imageAspect
      imageRect = CGRect(
        x: 0,
        y: (canvasBounds.height - height) / 2,
        width: width,
        height: height
      )
    }

    let outputSize = image.size
    let drawingScale = outputSize.width / max(imageRect.width, 1)
    let drawingImage = canvasView.drawing.image(
      from: imageRect,
      scale: drawingScale
    )
    let renderer = UIGraphicsImageRenderer(size: outputSize)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: outputSize))
      drawingImage.draw(in: CGRect(origin: .zero, size: outputSize))
    }
  }

  fileprivate func updateUndoState() {
    canUndo = canvasView?.undoManager?.canUndo ?? false
    canRedo = canvasView?.undoManager?.canRedo ?? false
  }
}

extension MobileImageMarkupController: PKCanvasViewDelegate {
  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
    updateUndoState()
  }
}

private struct MobileMarkupCanvas: UIViewRepresentable {
  @ObservedObject var controller: MobileImageMarkupController

  func makeUIView(context: Context) -> PKCanvasView {
    let canvasView = PKCanvasView()
    controller.attach(canvasView: canvasView)
    return canvasView
  }

  func updateUIView(_ canvasView: PKCanvasView, context: Context) {
    if controller.canvasView !== canvasView {
      controller.attach(canvasView: canvasView)
    }
  }
}

private struct MobileQuickLookPreview: UIViewControllerRepresentable {
  let url: URL

  func makeCoordinator() -> Coordinator {
    Coordinator(url: url)
  }

  func makeUIViewController(context: Context) -> QLPreviewController {
    let controller = QLPreviewController()
    controller.dataSource = context.coordinator
    return controller
  }

  func updateUIViewController(
    _ controller: QLPreviewController,
    context: Context
  ) {
    context.coordinator.url = url
    controller.reloadData()
  }

  final class Coordinator: NSObject, QLPreviewControllerDataSource {
    var url: URL

    init(url: URL) {
      self.url = url
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
      1
    }

    func previewController(
      _ controller: QLPreviewController,
      previewItemAt index: Int
    ) -> QLPreviewItem {
      url as NSURL
    }
  }
}
#endif

private func viewerTimestamp(_ milliseconds: Double) -> String {
  let date = Date(timeIntervalSince1970: milliseconds / 1_000)
  return date.formatted(date: .abbreviated, time: .shortened)
}

private func viewerMetadata(_ attachment: VectorMessageAttachment) -> String {
  let size = ByteCountFormatter.string(
    fromByteCount: Int64(attachment.size),
    countStyle: .file
  )
  if attachment.isVideo, let duration = attachment.duration {
    return "\(mediaDurationLabel(duration)) · \(size)"
  }
  return size
}

private func mediaDurationLabel(_ duration: Double) -> String {
  let seconds = max(0, Int(duration.rounded()))
  return String(format: "%d:%02d", seconds / 60, seconds % 60)
}

import SwiftUI

enum VectorTextEditorFocusAction: Equatable {
  case none
  case becomeFirstResponder
  case resignFirstResponder

  static func resolve(
    previouslyRequested: Bool,
    requested: Bool,
    isFirstResponder: Bool
  ) -> Self {
    if requested, !isFirstResponder {
      return .becomeFirstResponder
    }
    if previouslyRequested, !requested, isFirstResponder {
      return .resignFirstResponder
    }
    return .none
  }
}

struct VectorRichTextCommand: Equatable {
  let id = UUID()
  let action: MarkdownFormatAction
}

struct VectorRichTextFormatState: Equatable {
  var isBold = false
  var isItalic = false
  var isHeading = false
  var isBullet = false
  var isCode = false
  var isQuote = false
  var isLink = false

  func isActive(_ action: MarkdownFormatAction) -> Bool {
    switch action {
    case .bold: isBold
    case .italic: isItalic
    case .heading: isHeading
    case .bullet: isBullet
    case .code: isCode
    case .quote: isQuote
    case .link: isLink
    }
  }
}

#if os(iOS)
import UIKit
import UniformTypeIdentifiers

struct VectorStickerTextEditor: View {
  @Binding var text: String
  var isFocused = false
  var autoFocus = false
  var onFocusChange: (Bool) -> Void = { _ in }
  var onSticker: (Data, String, String) -> Void
  @State private var measuredHeight: CGFloat = 40

  var body: some View {
    ZStack(alignment: .leading) {
      if text.isEmpty {
        Text("Message")
          .font(.body)
          .foregroundStyle(.tertiary)
          .allowsHitTesting(false)
      }
      VectorStickerTextViewRepresentable(
        text: $text,
        isFocused: isFocused,
        autoFocus: autoFocus,
        onFocusChange: onFocusChange,
        onHeightChange: { measuredHeight = $0 },
        onSticker: onSticker
      )
    }
    .frame(height: measuredHeight)
    .accessibilityLabel("Message")
  }
}

private struct VectorStickerTextViewRepresentable: UIViewRepresentable {
  @Binding var text: String
  let isFocused: Bool
  let autoFocus: Bool
  let onFocusChange: (Bool) -> Void
  let onHeightChange: (CGFloat) -> Void
  let onSticker: (Data, String, String) -> Void

  func makeUIView(context: Context) -> UITextView {
    let textView = VectorStickerUITextView()
    textView.delegate = context.coordinator
    textView.onHeightChange = onHeightChange
    textView.backgroundColor = .clear
    textView.adjustsFontForContentSizeCategory = true
    textView.font = .preferredFont(forTextStyle: .body)
    textView.textColor = .label
    textView.tintColor = UIColor(red: 0.04, green: 0.55, blue: 0.72, alpha: 1)
    textView.textContainerInset = UIEdgeInsets(top: 9, left: 0, bottom: 9, right: 0)
    textView.textContainer.lineFragmentPadding = 0
    textView.isScrollEnabled = true
    textView.alwaysBounceVertical = false
    textView.supportsAdaptiveImageGlyph = true
    textView.text = text
    textView.shouldBecomeFirstResponderWhenAvailable = isFocused
    textView.autoFocusPending = autoFocus
    DispatchQueue.main.async {
      textView.reportHeight()
    }
    return textView
  }

  func updateUIView(_ textView: UITextView, context: Context) {
    context.coordinator.parent = self
    if let stickerTextView = textView as? VectorStickerUITextView {
      stickerTextView.onHeightChange = onHeightChange
      stickerTextView.shouldBecomeFirstResponderWhenAvailable = isFocused
    }
    if textView.attributedText.string != text,
       !context.coordinator.isExtractingSticker
    {
      let selectedRange = textView.selectedRange
      textView.text = text
      textView.selectedRange = NSRange(
        location: min(selectedRange.location, textView.textStorage.length),
        length: 0
      )
      (textView as? VectorStickerUITextView)?.reportHeight()
    }
    let focusAction = VectorTextEditorFocusAction.resolve(
      previouslyRequested: context.coordinator.lastRenderedFocusState,
      requested: isFocused,
      isFirstResponder: textView.isFirstResponder
    )
    context.coordinator.lastRenderedFocusState = isFocused
    if focusAction == .becomeFirstResponder {
      textView.becomeFirstResponder()
    } else if focusAction == .resignFirstResponder {
      textView.resignFirstResponder()
    }
  }

  func sizeThatFits(
    _ proposal: ProposedViewSize,
    uiView: UITextView,
    context: Context
  ) -> CGSize? {
    guard let width = proposal.width else { return nil }
    let measured = uiView.sizeThatFits(
      CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
    )
    return CGSize(width: width, height: min(max(40, measured.height), 120))
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    var parent: VectorStickerTextViewRepresentable
    var isExtractingSticker = false
    var lastRenderedFocusState: Bool
    private var pendingBlurWorkItem: DispatchWorkItem?

    init(parent: VectorStickerTextViewRepresentable) {
      self.parent = parent
      self.lastRenderedFocusState = parent.isFocused
    }

    func textViewDidChange(_ textView: UITextView) {
      let fullRange = NSRange(location: 0, length: textView.textStorage.length)
      var stickers: [(NSRange, NSAdaptiveImageGlyph)] = []
      textView.textStorage.enumerateAttribute(
        .adaptiveImageGlyph,
        in: fullRange
      ) { value, range, _ in
        if let glyph = value as? NSAdaptiveImageGlyph {
          stickers.append((range, glyph))
        }
      }

      if !stickers.isEmpty {
        isExtractingSticker = true
        for (_, glyph) in stickers {
          let rawContentType = NSAdaptiveImageGlyph.contentType
          let decodedPNG = UIImage(data: glyph.imageContent)?.pngData()
          let data = decodedPNG ?? glyph.imageContent
          let fileExtension = decodedPNG == nil
            ? rawContentType.preferredFilenameExtension ?? "heic"
            : "png"
          let mimeType = decodedPNG == nil
            ? rawContentType.preferredMIMEType ?? "image/heic"
            : "image/png"
          parent.onSticker(
            data,
            "sticker-\(UUID().uuidString).\(fileExtension)",
            mimeType
          )
        }
        for (range, _) in stickers.reversed() {
          textView.textStorage.deleteCharacters(in: range)
        }
        isExtractingSticker = false
      }

      parent.text = textView.attributedText.string
      textView.invalidateIntrinsicContentSize()
      (textView as? VectorStickerUITextView)?.reportHeight()
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
      pendingBlurWorkItem?.cancel()
      pendingBlurWorkItem = nil
      parent.onFocusChange(true)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
      let workItem = DispatchWorkItem { [weak self, weak textView] in
        guard
          let self,
          let textView,
          self.parent.isFocused,
          textView.window != nil,
          !textView.isFirstResponder
        else {
          return
        }
        self.parent.onFocusChange(false)
      }
      pendingBlurWorkItem = workItem
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.08, execute: workItem)
    }
  }
}

private final class VectorStickerUITextView: UITextView {
  var onHeightChange: ((CGFloat) -> Void)?
  var shouldBecomeFirstResponderWhenAvailable = false
  var autoFocusPending = false
  private var lastReportedHeight: CGFloat = 0

  override func didMoveToWindow() {
    super.didMoveToWindow()
    let shouldFocus = shouldBecomeFirstResponderWhenAvailable || autoFocusPending
    guard window != nil, shouldFocus else { return }
    autoFocusPending = false
    DispatchQueue.main.async { [weak self] in
      guard
        let self,
        self.window != nil,
        shouldFocus || self.shouldBecomeFirstResponderWhenAvailable,
        !self.isFirstResponder
      else { return }
      self.becomeFirstResponder()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    reportHeight()
  }

  func reportHeight() {
    guard bounds.width > 0 else { return }
    let fittingHeight = sizeThatFits(
      CGSize(width: bounds.width, height: .greatestFiniteMagnitude)
    ).height
    let height = min(max(40, fittingHeight), 120)
    guard abs(height - lastReportedHeight) > 0.5 else { return }
    lastReportedHeight = height
    DispatchQueue.main.async { [weak self] in
      self?.onHeightChange?(height)
    }
  }
}

struct VectorRichTextEditor: View {
  @Binding var text: String
  var minHeight: CGFloat
  var fontSize: CGFloat = 15
  var formatCommand: VectorRichTextCommand?
  var isFocused = false
  var onFocusChange: (Bool) -> Void = { _ in }
  var onFormatStateChange: (VectorRichTextFormatState) -> Void = { _ in }

  var body: some View {
    VectorRichTextViewRepresentable(
      text: $text,
      fontSize: fontSize,
      formatCommand: formatCommand,
      isFocused: isFocused,
      onFocusChange: onFocusChange,
      onFormatStateChange: onFormatStateChange
    )
    .frame(minHeight: minHeight, alignment: .topLeading)
  }
}

private struct VectorRichTextViewRepresentable: UIViewRepresentable {
  @Binding var text: String
  let fontSize: CGFloat
  let formatCommand: VectorRichTextCommand?
  let isFocused: Bool
  let onFocusChange: (Bool) -> Void
  let onFormatStateChange: (VectorRichTextFormatState) -> Void

  func makeUIView(context: Context) -> UITextView {
    let textView = UITextView()
    textView.delegate = context.coordinator
    textView.backgroundColor = .clear
    textView.isScrollEnabled = false
    textView.alwaysBounceVertical = false
    textView.allowsEditingTextAttributes = true
    textView.adjustsFontForContentSizeCategory = true
    textView.textContainerInset = UIEdgeInsets(top: 7, left: 0, bottom: 7, right: 0)
    textView.textContainer.lineFragmentPadding = 0
    textView.tintColor = UIColor(red: 0.04, green: 0.55, blue: 0.72, alpha: 1)
    textView.typingAttributes = VectorRichTextMarkdownCodec.baseAttributes(fontSize: fontSize)
    textView.attributedText = VectorRichTextMarkdownCodec.attributedString(from: text, fontSize: fontSize)
    textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return textView
  }

  func updateUIView(_ textView: UITextView, context: Context) {
    context.coordinator.parent = self

    let currentMarkdown = VectorRichTextMarkdownCodec.markdown(from: textView.attributedText)
    if currentMarkdown != text {
      if !textView.isFirstResponder || text.isEmpty {
        let selectedRange = textView.selectedRange
        let typingAttributes = textView.typingAttributes
        textView.attributedText = VectorRichTextMarkdownCodec.attributedString(from: text, fontSize: fontSize)
        textView.selectedRange = NSRange(
          location: min(selectedRange.location, textView.attributedText.length),
          length: min(selectedRange.length, max(0, textView.attributedText.length - selectedRange.location))
        )
        textView.typingAttributes = typingAttributes
      }
    }

    if let formatCommand, context.coordinator.lastAppliedCommandID != formatCommand.id {
      context.coordinator.lastAppliedCommandID = formatCommand.id
      context.coordinator.apply(formatCommand.action, to: textView)
    }

    if isFocused && !textView.isFirstResponder {
      textView.becomeFirstResponder()
    } else if !isFocused && textView.isFirstResponder {
      textView.resignFirstResponder()
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    var parent: VectorRichTextViewRepresentable
    var lastAppliedCommandID: UUID?
    private var isUpdatingText = false
    private var lastFormatState = VectorRichTextFormatState()
    private var pendingBlurWorkItem: DispatchWorkItem?
    private var textHadMention = false

    init(parent: VectorRichTextViewRepresentable) {
      self.parent = parent
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
      pendingBlurWorkItem?.cancel()
      pendingBlurWorkItem = nil
      parent.onFocusChange(true)
      updateFormatState(for: textView)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
      let workItem = DispatchWorkItem { [weak self, weak textView] in
        guard
          let self,
          let textView,
          self.parent.isFocused,
          textView.window != nil,
          !textView.isFirstResponder
        else {
          return
        }
        self.parent.onFocusChange(false)
      }
      pendingBlurWorkItem = workItem
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: workItem)
    }

    func textViewDidChange(_ textView: UITextView) {
      guard !isUpdatingText else {
        return
      }
      let hasMention = textView.text.contains("@")
      if hasMention || textHadMention {
        VectorRichTextMarkdownCodec.normalizeMentionAttributes(in: textView)
      }
      textHadMention = hasMention
      parent.text = VectorRichTextMarkdownCodec.markdown(from: textView.attributedText)
      updateFormatState(for: textView)
    }

    func textViewDidChangeSelection(_ textView: UITextView) {
      updateFormatState(for: textView)
    }

    func apply(_ action: MarkdownFormatAction, to textView: UITextView) {
      isUpdatingText = true
      defer {
        isUpdatingText = false
        parent.text = VectorRichTextMarkdownCodec.markdown(from: textView.attributedText)
        updateFormatState(for: textView)
      }

      switch action {
      case .bold:
        toggleFontTrait(.traitBold, in: textView)
      case .italic:
        toggleFontTrait(.traitItalic, in: textView)
      case .code:
        toggleInlineCode(in: textView)
      case .heading:
        toggleBlockStyle(.heading, in: textView)
      case .bullet:
        toggleBlockStyle(.bullet, in: textView)
      case .quote:
        toggleBlockStyle(.quote, in: textView)
      case .link:
        toggleLink(in: textView)
      }
    }

    private func toggleFontTrait(_ trait: UIFontDescriptor.SymbolicTraits, in textView: UITextView) {
      let selectedRange = textView.selectedRange
      if selectedRange.length == 0 {
        var attributes = textView.typingAttributes
        let font = attributes[.font] as? UIFont ?? VectorRichTextMarkdownCodec.baseFont(size: parent.fontSize)
        attributes[.font] = font.toggling(trait)
        textView.typingAttributes = attributes
        return
      }

      let storage = textView.textStorage
      let shouldApply = !storage.hasFontTrait(trait, in: selectedRange)
      storage.beginEditing()
      storage.enumerateAttribute(.font, in: selectedRange) { value, range, _ in
        let font = value as? UIFont ?? VectorRichTextMarkdownCodec.baseFont(size: parent.fontSize)
        storage.addAttribute(.font, value: font.setting(trait, enabled: shouldApply), range: range)
      }
      storage.endEditing()
      textView.selectedRange = selectedRange
    }

    private func toggleInlineCode(in textView: UITextView) {
      let selectedRange = textView.selectedRange
      if selectedRange.length == 0 {
        var attributes = textView.typingAttributes
        let isCode = attributes[.vectorInlineCode] as? Bool == true
        VectorRichTextMarkdownCodec.applyCodeAttributes(&attributes, enabled: !isCode, fontSize: parent.fontSize)
        textView.typingAttributes = attributes
        return
      }

      let storage = textView.textStorage
      let shouldApply = !storage.hasInlineCode(in: selectedRange)
      storage.beginEditing()
      if shouldApply {
        storage.addAttributes(VectorRichTextMarkdownCodec.codeAttributes(fontSize: parent.fontSize), range: selectedRange)
      } else {
        storage.removeAttribute(.vectorInlineCode, range: selectedRange)
        storage.removeAttribute(.backgroundColor, range: selectedRange)
        storage.addAttribute(.font, value: VectorRichTextMarkdownCodec.baseFont(size: parent.fontSize), range: selectedRange)
      }
      storage.endEditing()
      textView.selectedRange = selectedRange
    }

    private func toggleBlockStyle(_ blockStyle: VectorRichTextBlockStyle, in textView: UITextView) {
      let storage = textView.textStorage

      if storage.length == 0 {
        if blockStyle == .bullet {
          storage.setAttributedString(NSAttributedString(string: "• ", attributes: VectorRichTextMarkdownCodec.blockAttributes(.bullet, fontSize: parent.fontSize)))
          textView.selectedRange = NSRange(location: 2, length: 0)
        } else {
          var attributes = textView.typingAttributes
          attributes.merge(VectorRichTextMarkdownCodec.blockAttributes(blockStyle, fontSize: parent.fontSize)) { _, new in new }
          textView.typingAttributes = attributes
        }
        return
      }

      let nsText = textView.attributedText.string as NSString
      var selectedRange = textView.selectedRange
      let paragraphRange = nsText.paragraphRange(for: selectedRange)
      let currentStyle = storage.attribute(.vectorBlockStyle, at: max(0, min(paragraphRange.location, storage.length - 1)), effectiveRange: nil) as? String
      let shouldApply = currentStyle != blockStyle.rawValue

      storage.beginEditing()
      if blockStyle == .bullet {
        selectedRange = normalizeBulletPrefix(shouldApply: shouldApply, paragraphRange: paragraphRange, textView: textView)
      }

      let adjustedParagraphRange = nsTextAfterBulletChange(textView).paragraphRange(for: selectedRange)
      if shouldApply {
        storage.addAttribute(.vectorBlockStyle, value: blockStyle.rawValue, range: adjustedParagraphRange)
        storage.addAttributes(VectorRichTextMarkdownCodec.blockAttributes(blockStyle, fontSize: parent.fontSize), range: adjustedParagraphRange)
      } else {
        storage.removeAttribute(.vectorBlockStyle, range: adjustedParagraphRange)
        storage.addAttributes(VectorRichTextMarkdownCodec.baseAttributes(fontSize: parent.fontSize), range: adjustedParagraphRange)
      }
      storage.endEditing()
      textView.selectedRange = selectedRange
    }

    private func normalizeBulletPrefix(shouldApply: Bool, paragraphRange: NSRange, textView: UITextView) -> NSRange {
      let storage = textView.textStorage
      let paragraph = (storage.string as NSString).substring(with: paragraphRange)
      var selectedRange = textView.selectedRange
      if shouldApply {
        guard !paragraph.hasPrefix("• ") else {
          return selectedRange
        }
        storage.insert(NSAttributedString(string: "• ", attributes: VectorRichTextMarkdownCodec.baseAttributes(fontSize: parent.fontSize)), at: paragraphRange.location)
        selectedRange.location += 2
      } else if paragraph.hasPrefix("• ") {
        storage.deleteCharacters(in: NSRange(location: paragraphRange.location, length: min(2, storage.length - paragraphRange.location)))
        selectedRange.location = max(paragraphRange.location, selectedRange.location - 2)
      }
      return selectedRange
    }

    private func nsTextAfterBulletChange(_ textView: UITextView) -> NSString {
      textView.attributedText.string as NSString
    }

    private func toggleLink(in textView: UITextView) {
      let selectedRange = textView.selectedRange
      let storage = textView.textStorage
      if selectedRange.length == 0 {
        let linkedText = NSAttributedString(
          string: "link",
          attributes: VectorRichTextMarkdownCodec.linkAttributes(
            url: VectorRichTextMarkdownCodec.placeholderLinkURL,
            fontSize: parent.fontSize
          )
        )
        storage.insert(linkedText, at: selectedRange.location)
        textView.selectedRange = NSRange(location: selectedRange.location, length: linkedText.length)
        return
      }

      let hasLink = storage.attribute(.link, at: selectedRange.location, effectiveRange: nil) != nil
      if hasLink {
        storage.removeAttribute(.link, range: selectedRange)
        storage.removeAttribute(.foregroundColor, range: selectedRange)
        storage.removeAttribute(.underlineStyle, range: selectedRange)
      } else {
        storage.addAttributes(
          VectorRichTextMarkdownCodec.linkAttributes(
            url: VectorRichTextMarkdownCodec.placeholderLinkURL,
            fontSize: parent.fontSize
          ),
          range: selectedRange
        )
      }
      textView.selectedRange = selectedRange
    }

    private func updateFormatState(for textView: UITextView) {
      let range = normalizedInspectionRange(for: textView)
      let storage = textView.textStorage
      let attributes = textView.typingAttributes
      let inspectionIndex = storage.length > 0 ? min(range.location, storage.length - 1) : nil
      let font = range.length == 0 || inspectionIndex == nil
        ? attributes[.font] as? UIFont
        : storage.attribute(.font, at: inspectionIndex!, effectiveRange: nil) as? UIFont
      let blockStyle = inspectionIndex.flatMap {
        storage.attribute(.vectorBlockStyle, at: $0, effectiveRange: nil) as? String
      } ?? attributes[.vectorBlockStyle] as? String
      let isInlineCode = range.length == 0 || inspectionIndex == nil
        ? attributes[.vectorInlineCode] as? Bool == true
        : storage.attribute(.vectorInlineCode, at: inspectionIndex!, effectiveRange: nil) as? Bool == true
      let hasLink = range.length > 0 && inspectionIndex != nil
        ? storage.attribute(.link, at: inspectionIndex!, effectiveRange: nil) != nil
        : false

      let state = VectorRichTextFormatState(
        isBold: font?.fontDescriptor.symbolicTraits.contains(.traitBold) ?? false,
        isItalic: font?.fontDescriptor.symbolicTraits.contains(.traitItalic) ?? false,
        isHeading: blockStyle == VectorRichTextBlockStyle.heading.rawValue,
        isBullet: blockStyle == VectorRichTextBlockStyle.bullet.rawValue,
        isCode: isInlineCode,
        isQuote: blockStyle == VectorRichTextBlockStyle.quote.rawValue,
        isLink: hasLink
      )
      guard state != lastFormatState else {
        return
      }
      lastFormatState = state
      parent.onFormatStateChange(state)
    }

    private func normalizedInspectionRange(for textView: UITextView) -> NSRange {
      let selectedRange = textView.selectedRange
      if selectedRange.length > 0 {
        return selectedRange
      }
      guard textView.textStorage.length > 0 else {
        return selectedRange
      }
      return NSRange(location: max(0, min(selectedRange.location, textView.textStorage.length - 1)), length: 0)
    }
  }
}

private enum VectorRichTextBlockStyle: String {
  case heading
  case bullet
  case quote
}

private enum VectorRichTextMarkdownCodec {
  static let placeholderLinkURL = URL(string: "https://example.com")!

  static func baseFont(size: CGFloat) -> UIFont {
    UIFont.systemFont(ofSize: size)
  }

  static func baseAttributes(fontSize: CGFloat) -> [NSAttributedString.Key: Any] {
    [
      .font: baseFont(size: fontSize),
      .foregroundColor: UIColor.label,
    ]
  }

  static func codeAttributes(fontSize: CGFloat) -> [NSAttributedString.Key: Any] {
    [
      .font: UIFont.monospacedSystemFont(ofSize: max(12, fontSize - 1), weight: .regular),
      .foregroundColor: UIColor.label,
      .backgroundColor: UIColor.secondarySystemFill,
      .vectorInlineCode: true,
    ]
  }

  static func linkAttributes(url: URL, fontSize: CGFloat) -> [NSAttributedString.Key: Any] {
    [
      .font: baseFont(size: fontSize),
      .foregroundColor: UIColor(red: 0.04, green: 0.55, blue: 0.72, alpha: 1),
      .underlineStyle: NSUnderlineStyle.single.rawValue,
      .link: url,
    ]
  }

  static func blockAttributes(_ style: VectorRichTextBlockStyle, fontSize: CGFloat) -> [NSAttributedString.Key: Any] {
    switch style {
    case .heading:
      return [
        .font: UIFont.systemFont(ofSize: fontSize + 4, weight: .semibold),
        .foregroundColor: UIColor.label,
        .vectorBlockStyle: style.rawValue,
      ]
    case .bullet:
      return [
        .font: baseFont(size: fontSize),
        .foregroundColor: UIColor.label,
        .vectorBlockStyle: style.rawValue,
      ]
    case .quote:
      let paragraph = NSMutableParagraphStyle()
      paragraph.firstLineHeadIndent = 12
      paragraph.headIndent = 12
      return [
        .font: UIFont.italicSystemFont(ofSize: fontSize),
        .foregroundColor: UIColor.secondaryLabel,
        .paragraphStyle: paragraph,
        .vectorBlockStyle: style.rawValue,
      ]
    }
  }

  static func applyCodeAttributes(_ attributes: inout [NSAttributedString.Key: Any], enabled: Bool, fontSize: CGFloat) {
    if enabled {
      attributes.merge(codeAttributes(fontSize: fontSize)) { _, new in new }
    } else {
      attributes.removeValue(forKey: .vectorInlineCode)
      attributes.removeValue(forKey: .backgroundColor)
      attributes[.font] = baseFont(size: fontSize)
      attributes[.foregroundColor] = UIColor.label
    }
  }

  static func attributedString(from markdown: String, fontSize: CGFloat) -> NSAttributedString {
    let output = NSMutableAttributedString()
    let lines = markdown.components(separatedBy: "\n")

    for (index, rawLine) in lines.enumerated() {
      var line = rawLine
      var blockStyle: VectorRichTextBlockStyle?
      if line.hasPrefix("### ") {
        blockStyle = .heading
        line.removeFirst(4)
      } else if line.hasPrefix("## ") {
        blockStyle = .heading
        line.removeFirst(3)
      } else if line.hasPrefix("# ") {
        blockStyle = .heading
        line.removeFirst(2)
      } else if line.hasPrefix("- ") {
        blockStyle = .bullet
        line = "• " + String(line.dropFirst(2))
      } else if line.hasPrefix("> ") {
        blockStyle = .quote
        line.removeFirst(2)
      }

      let attributedLine = inlineAttributedString(from: line, fontSize: fontSize)
      if let blockStyle, attributedLine.length > 0 {
        attributedLine.addAttributes(blockAttributes(blockStyle, fontSize: fontSize), range: NSRange(location: 0, length: attributedLine.length))
      }
      output.append(attributedLine)
      if index < lines.count - 1 {
        output.append(NSAttributedString(string: "\n", attributes: baseAttributes(fontSize: fontSize)))
      }
    }

    return output
  }

  static func markdown(from attributedString: NSAttributedString) -> String {
    guard attributedString.length > 0 else {
      return ""
    }

    var result = ""
    let nsString = attributedString.string as NSString
    var location = 0
    while location < attributedString.length {
      let paragraphRange = nsString.paragraphRange(for: NSRange(location: location, length: 0))
      let paragraphText = nsString.substring(with: paragraphRange)
      let newlineSuffix = paragraphText.hasSuffix("\n") ? "\n" : ""
      let contentRange = NSRange(location: paragraphRange.location, length: max(0, paragraphRange.length - newlineSuffix.count))
      let blockStyle = contentRange.length > 0 ? attributedString.attribute(.vectorBlockStyle, at: contentRange.location, effectiveRange: nil) as? String : nil
      var line = inlineMarkdown(from: attributedString, range: contentRange)

      if blockStyle == VectorRichTextBlockStyle.bullet.rawValue {
        if line.hasPrefix("• ") {
          line.removeFirst(2)
        }
        line = "- " + line
      } else if blockStyle == VectorRichTextBlockStyle.heading.rawValue {
        line = "## " + line
      } else if blockStyle == VectorRichTextBlockStyle.quote.rawValue {
        line = "> " + line
      }

      result += line + newlineSuffix
      location = paragraphRange.location + paragraphRange.length
    }
    return result
  }

  @MainActor
  static func normalizeMentionAttributes(in textView: UITextView) {
    let storage = textView.textStorage
    let selectedRange = textView.selectedRange
    let fullRange = NSRange(location: 0, length: storage.length)
    storage.removeAttribute(.vectorMention, range: fullRange)

    let pattern = #"(?<!\S)@[A-Za-z0-9._-]+"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else {
      return
    }

    let matches = regex.matches(in: storage.string, range: fullRange)
    for match in matches {
      storage.addAttributes([
        .vectorMention: true,
        .foregroundColor: UIColor(red: 0.04, green: 0.55, blue: 0.72, alpha: 1),
        .backgroundColor: UIColor(red: 0.04, green: 0.55, blue: 0.72, alpha: 0.12),
      ], range: match.range)
    }
    textView.selectedRange = selectedRange
  }

  private static func inlineAttributedString(from markdown: String, fontSize: CGFloat) -> NSMutableAttributedString {
    let output = NSMutableAttributedString()
    var index = markdown.startIndex

    while index < markdown.endIndex {
      if markdown[index...].hasPrefix("**"), let end = markdown[markdown.index(index, offsetBy: 2)...].range(of: "**") {
        let contentStart = markdown.index(index, offsetBy: 2)
        let content = String(markdown[contentStart..<end.lowerBound])
        var attributes = baseAttributes(fontSize: fontSize)
        attributes[.font] = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
        output.append(NSAttributedString(string: content, attributes: attributes))
        index = end.upperBound
      } else if markdown[index] == "_", let end = markdown[markdown.index(after: index)...].firstIndex(of: "_") {
        let content = String(markdown[markdown.index(after: index)..<end])
        var attributes = baseAttributes(fontSize: fontSize)
        attributes[.font] = UIFont.italicSystemFont(ofSize: fontSize)
        output.append(NSAttributedString(string: content, attributes: attributes))
        index = markdown.index(after: end)
      } else if markdown[index] == "`", let end = markdown[markdown.index(after: index)...].firstIndex(of: "`") {
        let content = String(markdown[markdown.index(after: index)..<end])
        output.append(NSAttributedString(string: content, attributes: codeAttributes(fontSize: fontSize)))
        index = markdown.index(after: end)
      } else if markdown[index] == "[", let labelEnd = markdown[markdown.index(after: index)...].firstIndex(of: "]") {
        let afterLabel = markdown.index(after: labelEnd)
        if afterLabel < markdown.endIndex, markdown[afterLabel] == "(", let urlEnd = markdown[markdown.index(after: afterLabel)...].firstIndex(of: ")") {
          let label = String(markdown[markdown.index(after: index)..<labelEnd])
          let urlString = String(markdown[markdown.index(after: afterLabel)..<urlEnd])
          let url = URL(string: urlString) ?? placeholderLinkURL
          output.append(NSAttributedString(string: label, attributes: linkAttributes(url: url, fontSize: fontSize)))
          index = markdown.index(after: urlEnd)
        } else {
          output.append(NSAttributedString(string: String(markdown[index]), attributes: baseAttributes(fontSize: fontSize)))
          index = markdown.index(after: index)
        }
      } else {
        output.append(NSAttributedString(string: String(markdown[index]), attributes: baseAttributes(fontSize: fontSize)))
        index = markdown.index(after: index)
      }
    }

    return output
  }

  private static func inlineMarkdown(from attributedString: NSAttributedString, range: NSRange) -> String {
    guard range.length > 0 else {
      return ""
    }

    var output = ""
    attributedString.enumerateAttributes(in: range) { attributes, subrange, _ in
      var text = (attributedString.string as NSString).substring(with: subrange)
      guard !text.isEmpty else {
        return
      }

      if let url = attributes[.link] as? URL {
        text = "[\(text)](\(url.absoluteString))"
      } else {
        if attributes[.vectorInlineCode] as? Bool == true {
          text = "`\(text)`"
        }
        let blockStyle = attributes[.vectorBlockStyle] as? String
        if let font = attributes[.font] as? UIFont {
          let shouldSerializeFontTraits = blockStyle == nil || blockStyle == VectorRichTextBlockStyle.bullet.rawValue
          if shouldSerializeFontTraits && font.fontDescriptor.symbolicTraits.contains(.traitBold) {
            text = "**\(text)**"
          }
          if shouldSerializeFontTraits && font.fontDescriptor.symbolicTraits.contains(.traitItalic) {
            text = "_\(text)_"
          }
        }
      }
      output += text
    }
    return output
  }
}

private extension UIFont {
  func toggling(_ trait: UIFontDescriptor.SymbolicTraits) -> UIFont {
    setting(trait, enabled: !fontDescriptor.symbolicTraits.contains(trait))
  }

  func setting(_ trait: UIFontDescriptor.SymbolicTraits, enabled: Bool) -> UIFont {
    var traits = fontDescriptor.symbolicTraits
    if enabled {
      traits.insert(trait)
    } else {
      traits.remove(trait)
    }
    guard let descriptor = fontDescriptor.withSymbolicTraits(traits) else {
      return self
    }
    return UIFont(descriptor: descriptor, size: pointSize)
  }
}

private extension NSTextStorage {
  func hasFontTrait(_ trait: UIFontDescriptor.SymbolicTraits, in range: NSRange) -> Bool {
    guard range.length > 0 else {
      return false
    }
    var hasTrait = true
    enumerateAttribute(.font, in: range) { value, _, stop in
      let font = value as? UIFont
      if font?.fontDescriptor.symbolicTraits.contains(trait) != true {
        hasTrait = false
        stop.pointee = true
      }
    }
    return hasTrait
  }

  func hasInlineCode(in range: NSRange) -> Bool {
    guard range.length > 0 else {
      return false
    }
    var hasCode = true
    enumerateAttribute(.vectorInlineCode, in: range) { value, _, stop in
      if value as? Bool != true {
        hasCode = false
        stop.pointee = true
      }
    }
    return hasCode
  }
}

private extension NSAttributedString.Key {
  static let vectorInlineCode = NSAttributedString.Key("studio.imai.vector.inlineCode")
  static let vectorBlockStyle = NSAttributedString.Key("studio.imai.vector.blockStyle")
  static let vectorMention = NSAttributedString.Key("studio.imai.vector.mention")
}

#else

struct VectorStickerTextEditor: View {
  @Binding var text: String
  var isFocused = false
  var autoFocus = false
  var onFocusChange: (Bool) -> Void = { _ in }
  var onSticker: (Data, String, String) -> Void

  var body: some View {
    TextField("Message", text: $text, axis: .vertical)
      .lineLimit(1...6)
  }
}

struct VectorRichTextEditor: View {
  @Binding var text: String
  var minHeight: CGFloat
  var fontSize: CGFloat = 15
  var formatCommand: VectorRichTextCommand?
  var isFocused = false
  var onFocusChange: (Bool) -> Void = { _ in }
  var onFormatStateChange: (VectorRichTextFormatState) -> Void = { _ in }

  var body: some View {
    TextEditor(text: $text)
      .font(.system(size: fontSize))
      .frame(minHeight: minHeight, alignment: .topLeading)
      .onChange(of: formatCommand) { _, command in
        guard let command else {
          return
        }
        text = command.action.apply(to: text)
      }
  }
}

#endif

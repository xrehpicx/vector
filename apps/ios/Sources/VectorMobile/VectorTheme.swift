import SwiftUI

enum VectorTheme {
  static let mutedText = Color.secondary

  #if os(iOS)
  static let surfaceBackground = Color(.systemBackground)
  static let rowBackground = Color(.secondarySystemGroupedBackground)
  static let groupedBackground = Color(.systemGroupedBackground)
  static let inputBackground = Color(.tertiarySystemGroupedBackground)
  static let border = Color(uiColor: .separator)
  #else
  static let surfaceBackground = Color(nsColor: .windowBackgroundColor)
  static let rowBackground = Color(nsColor: .controlBackgroundColor)
  static let groupedBackground = Color(nsColor: .windowBackgroundColor)
  static let inputBackground = Color(nsColor: .textBackgroundColor)
  static let border = Color(nsColor: .separatorColor)
  #endif

  static let accent = Color(red: 0.04, green: 0.55, blue: 0.72)
}

extension Color {
  init(vectorHex hex: String?) {
    guard let hex else {
      self = Color.secondary
      return
    }

    let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var value: UInt64 = 0
    Scanner(string: clean).scanHexInt64(&value)

    let red: Double
    let green: Double
    let blue: Double

    switch clean.count {
    case 6:
      red = Double((value & 0xFF0000) >> 16) / 255
      green = Double((value & 0x00FF00) >> 8) / 255
      blue = Double(value & 0x0000FF) / 255
    default:
      red = 0.58
      green = 0.64
      blue = 0.72
    }

    self = Color(red: red, green: green, blue: blue)
  }
}

struct VectorPill: View {
  let text: String
  var color: Color = Color.secondary
  var systemImage: String? = nil

  var body: some View {
    HStack(spacing: 4) {
      if let systemImage {
        Image(systemName: systemImage)
          .font(.caption2)
      }
      Text(text)
        .lineLimit(1)
    }
    .font(.caption)
    .foregroundStyle(color)
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(color.opacity(0.10), in: Capsule())
  }
}

func vectorSystemImage(for icon: String?) -> String {
  switch icon {
  case "check-circle": "checkmark.circle"
  case "loader", "activity": "rays"
  case "circle": "circle"
  case "signal-high": "exclamationmark.2"
  case "signal-medium": "equal"
  case "signal-low": "minus"
  case "map": "map"
  case "sparkles": "sparkles"
  case "box": "shippingbox"
  case "palette": "paintpalette"
  case "calendar": "calendar"
  default: "circle.dotted"
  }
}

extension View {
  @ViewBuilder
  func vectorInlineNavigationTitle() -> some View {
    #if os(iOS)
    navigationBarTitleDisplayMode(.inline)
    #else
    self
    #endif
  }

  func vectorShadowRing(cornerRadius: CGFloat = 8) -> some View {
    self
      .overlay(
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(VectorTheme.border.opacity(0.22), lineWidth: 0.5)
      )
      .shadow(color: Color.black.opacity(0.055), radius: 10, x: 0, y: 5)
  }

  @ViewBuilder
  func vectorHiddenNavigationBar() -> some View {
    #if os(iOS)
    toolbar(.hidden, for: .navigationBar)
    #else
    self
    #endif
  }
}

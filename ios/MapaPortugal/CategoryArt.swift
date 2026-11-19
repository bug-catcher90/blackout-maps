import UIKit

enum CategoryArt {
    static func image(_ kind: Int) -> UIImage {
        render { _ in
            disk(color(kind))
            UIColor.white.setStroke()
            UIColor.white.setFill()
            switch kind {
            case 0: cross()
            case 1: shield()
            case 2: flame()
            case 3: pump()
            case 4: basket()
            default: fork()
            }
        }
    }

    static func water() -> UIImage {
        render { _ in
            disk(UIColor(red: 14 / 255, green: 116 / 255, blue: 144 / 255, alpha: 1))
            let drop = UIBezierPath()
            drop.move(to: CGPoint(x: 32, y: 14))
            drop.addCurve(to: CGPoint(x: 32, y: 48), controlPoint1: CGPoint(x: 46, y: 30), controlPoint2: CGPoint(x: 44, y: 40))
            drop.addCurve(to: CGPoint(x: 32, y: 14), controlPoint1: CGPoint(x: 20, y: 40), controlPoint2: CGPoint(x: 18, y: 30))
            drop.close()
            UIColor.white.setFill()
            drop.fill()
        }
    }

    private static func color(_ kind: Int) -> UIColor {
        switch kind {
        case 0: UIColor(red: 15 / 255, green: 107 / 255, blue: 76 / 255, alpha: 1)
        case 1: UIColor(red: 29 / 255, green: 78 / 255, blue: 216 / 255, alpha: 1)
        case 2: UIColor(red: 220 / 255, green: 38 / 255, blue: 38 / 255, alpha: 1)
        case 3: UIColor(red: 124 / 255, green: 58 / 255, blue: 237 / 255, alpha: 1)
        case 4: UIColor(red: 180 / 255, green: 83 / 255, blue: 9 / 255, alpha: 1)
        default: UIColor(red: 190 / 255, green: 24 / 255, blue: 93 / 255, alpha: 1)
        }
    }

    private static func render(_ draw: (CGContext) -> Void) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32), format: format)
        return renderer.image { context in
            context.cgContext.scaleBy(x: 0.5, y: 0.5)
            draw(context.cgContext)
        }
    }

    private static func disk(_ color: UIColor) {
        let circle = UIBezierPath(arcCenter: CGPoint(x: 32, y: 32), radius: 26, startAngle: 0, endAngle: .pi * 2, clockwise: true)
        color.setFill()
        circle.fill()
        circle.lineWidth = 6
        UIColor.white.setStroke()
        circle.stroke()
    }

    private static func cross() {
        UIBezierPath(rect: CGRect(x: 28, y: 16, width: 8, height: 32)).fill()
        UIBezierPath(rect: CGRect(x: 16, y: 28, width: 32, height: 8)).fill()
    }

    private static func shield() {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 32, y: 14))
        path.addLine(to: CGPoint(x: 48, y: 20))
        path.addLine(to: CGPoint(x: 44, y: 38))
        path.addQuadCurve(to: CGPoint(x: 20, y: 38), controlPoint: CGPoint(x: 32, y: 50))
        path.addLine(to: CGPoint(x: 16, y: 20))
        path.close()
        stroke(path)
    }

    private static func flame() {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 32, y: 14))
        path.addQuadCurve(to: CGPoint(x: 40, y: 42), controlPoint: CGPoint(x: 46, y: 28))
        path.addQuadCurve(to: CGPoint(x: 24, y: 42), controlPoint: CGPoint(x: 32, y: 50))
        path.addQuadCurve(to: CGPoint(x: 32, y: 14), controlPoint: CGPoint(x: 18, y: 28))
        path.close()
        path.fill()
    }

    private static func pump() {
        let body = UIBezierPath(rect: CGRect(x: 26, y: 16, width: 12, height: 28))
        stroke(body)
        let hose = UIBezierPath()
        hose.move(to: CGPoint(x: 38, y: 20))
        hose.addLine(to: CGPoint(x: 46, y: 20))
        hose.addLine(to: CGPoint(x: 46, y: 30))
        hose.addLine(to: CGPoint(x: 38, y: 30))
        stroke(hose)
    }

    private static func basket() {
        let body = UIBezierPath(rect: CGRect(x: 18, y: 26, width: 28, height: 18))
        stroke(body)
        let handle = UIBezierPath()
        handle.move(to: CGPoint(x: 22, y: 26))
        handle.addLine(to: CGPoint(x: 26, y: 16))
        handle.addLine(to: CGPoint(x: 40, y: 16))
        handle.addLine(to: CGPoint(x: 44, y: 26))
        stroke(handle)
    }

    private static func fork() {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 24, y: 14))
        path.addLine(to: CGPoint(x: 24, y: 36))
        path.move(to: CGPoint(x: 30, y: 14))
        path.addLine(to: CGPoint(x: 30, y: 36))
        path.move(to: CGPoint(x: 40, y: 14))
        path.addLine(to: CGPoint(x: 40, y: 28))
        path.addQuadCurve(to: CGPoint(x: 32, y: 36), controlPoint: CGPoint(x: 40, y: 36))
        stroke(path)
    }

    private static func stroke(_ path: UIBezierPath) {
        path.lineWidth = 4
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        path.stroke()
    }
}

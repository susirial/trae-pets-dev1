import Foundation

let maxInputBytes = 1_048_576
let requestSchema = "trae.pet.secure-core.request.v1"
let responseSchema = "trae.pet.secure-core.response.v1"

func fail(_ message: String, _ code: Int32 = 2) -> Never {
    FileHandle.standardError.write(Data(("secure-core: \(message)\n").utf8))
    exit(code)
}

func string(_ value: Any?) -> String {
    if value == nil || value is NSNull { return "" }
    if let value = value as? String { return value }
    if let value = value as? NSNumber { return value.stringValue }
    return String(describing: value!)
}

func object(_ value: Any?) -> [String: Any] {
    value as? [String: Any] ?? [:]
}

func bool(_ value: Any?, default fallback: Bool = false) -> Bool {
    (value as? Bool) ?? fallback
}

func matches(_ pattern: String, _ text: String, options: NSRegularExpression.Options = [.caseInsensitive]) -> Bool {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return false }
    return regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
}

func replacing(_ pattern: String, in text: String, template: String) -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return text }
    return regex.stringByReplacingMatches(
        in: text,
        range: NSRange(text.startIndex..., in: text),
        withTemplate: template
    )
}

func redactSecrets(_ value: Any?) -> String {
    var output = string(value)
    output = replacing(#"(authorization\s*:\s*bearer\s+)[^\s"'`]+"#, in: output, template: "$1***")
    output = replacing(#"((?:api[_-]?key|token|secret|password|passwd|pwd)\s*[=:]\s*)[^\s"'`&]+"#, in: output, template: "$1***")
    output = replacing(#"\bsk-[A-Za-z0-9_-]{12,}\b"#, in: output, template: "***")
    output = replacing(#"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"#, in: output, template: "***")
    return output
}

func compactText(_ value: Any?, _ maxLength: Int = 84) -> String {
    let redacted = redactSecrets(value)
    let normalized = replacing(#"\s+"#, in: redacted, template: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    if normalized.count <= maxLength { return normalized }
    return String(normalized.prefix(max(0, maxLength - 1))) + "..."
}

func basenameOnly(_ value: Any?) -> String {
    string(value).split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? ""
}

func summarizeCommand(_ value: Any?, maxTokens: Int = 5, maxLength: Int = 84) -> String {
    let input = string(value).trimmingCharacters(in: .whitespacesAndNewlines)
    if input.isEmpty { return "" }
    let pattern = #""[^"]*"|'[^']*'|`[^`]*`|[^\s]+"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return "" }
    let ns = input as NSString
    let rawTokens = regex.matches(in: input, range: NSRange(location: 0, length: ns.length))
        .map { ns.substring(with: $0.range) }
    var tokens: [String] = []
    var index = 0
    while index < rawTokens.count {
        let token = redactSecrets(rawTokens[index])
        if matches(#"^((?:--?)(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|auth))=(.+)$"#, token) {
            let name = token.split(separator: "=", maxSplits: 1).first.map(String.init) ?? token
            tokens.append(name + "=***")
        } else {
            tokens.append(token)
            if matches(#"^--?(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|auth)$"#, token),
               index + 1 < rawTokens.count {
                tokens.append("***")
                index += 1
            }
        }
        index += 1
    }
    let shown = Array(tokens.prefix(max(1, maxTokens)))
    return compactText(shown.joined(separator: " ") + (tokens.count > shown.count ? " ..." : ""), maxLength)
}

func toolFailed(_ event: [String: Any]) -> Bool {
    let response = object(event["tool_response"])
    if response.isEmpty { return false }
    if let success = response["success"] as? Bool, !success { return true }
    let exitValue = response["exitCode"] ?? response["exit_code"]
    if exitValue != nil && Double(string(exitValue)) != 0 { return true }
    if response["error"] != nil || response["errorMessage"] != nil { return true }
    return matches(#"^(error|failed|failure)$"#, string(response["status"]))
}

func selectAction(_ event: [String: Any]) -> [String: String] {
    let eventName = string(event["hook_event_name"]).isEmpty ? "Manual" : string(event["hook_event_name"])
    let toolName = string(event["tool_name"])
    let input = object(event["tool_input"])
    let command = string(input["command"] ?? input["cmd"] ?? input["script"] ?? input["code"])
    let readOnly = matches(#"read|grep|glob|search|fetch|ls"#, toolName)
    switch eventName {
    case "SessionStart": return ["name": "waving", "reason": "新会话开始，播放问候动画。"]
    case "SessionEnd": return ["name": "idle", "reason": "会话结束，回到待命。"]
    case "UserPromptSubmit": return ["name": "review", "reason": "用户提交了请求，进入审阅状态。"]
    case "PreToolUse":
        if matches(#"run|command|terminal|execute"#, toolName)
            || matches(#"\b(npm|pnpm|yarn|pytest|go test|cargo test|mvn test|gradle|pip|curl|git clone)\b"#, command) {
            return ["name": "waiting", "reason": "即将执行命令或耗时任务。"]
        }
        return ["name": "review", "reason": readOnly ? "只读查询，检视上下文。" : "即将调用工具，进入审阅状态。"]
    case "PostToolUse":
        if toolFailed(event) { return ["name": "failed", "reason": "工具执行失败。"] }
        if readOnly { return ["name": "review", "reason": "只读查询完成，继续审阅。"] }
        if matches(#"diagnostic|test|run|command|terminal|execute"#, toolName)
            || matches(#"\b(test|build|lint|check)\b"#, command) {
            return ["name": "happy", "reason": "命令或校验成功完成。"]
        }
        if matches(#"write|edit|patch|apply"#, toolName) {
            return ["name": "jumping", "reason": "文件改动完成，播放提示动画。"]
        }
        return ["name": "idle", "reason": "工具执行完成，回到待命。"]
    case "Stop": return ["name": "idle", "reason": "回复结束，回到待命。"]
    case "PreCompact": return ["name": "review", "reason": "即将进行上下文压缩。"]
    default: return ["name": "idle", "reason": "未知或手动事件，保持待命。"]
    }
}

func interpolate(_ template: String, _ vars: [String: String]) -> String {
    guard let regex = try? NSRegularExpression(pattern: #"\{(\w+)\}"#) else { return template }
    let ns = template as NSString
    var result = template
    for match in regex.matches(in: template, range: NSRange(location: 0, length: ns.length)).reversed() {
        let key = ns.substring(with: match.range(at: 1))
        if let range = Range(match.range, in: result) { result.replaceSubrange(range, with: vars[key] ?? "") }
    }
    return replacing(#"\s+"#, in: result, template: " ").trimmingCharacters(in: .whitespacesAndNewlines)
}

func inputSummary(_ event: [String: Any], _ privacy: [String: Any]) -> String {
    let input = object(event["tool_input"])
    if !string(input["file_path"]).isEmpty { return basenameOnly(input["file_path"]) }
    if !string(input["path"]).isEmpty && !string(input["pattern"]).isEmpty {
        return "\(basenameOnly(input["path"])) / \(compactText(input["pattern"], 42))"
    }
    if !string(input["pattern"]).isEmpty { return compactText(input["pattern"], 64) }
    if !string(input["command"]).isEmpty {
        return bool(privacy["showCommandArgs"])
            ? compactText(input["command"], 84)
            : summarizeCommand(input["command"], maxTokens: 5, maxLength: 64)
    }
    if !string(input["url"]).isEmpty { return compactText(input["url"], 84) }
    return ""
}

func resultSummary(_ event: [String: Any]) -> String {
    let response = object(event["tool_response"])
    if let exitValue = response["exitCode"] ?? response["exit_code"] { return "退出码 \(string(exitValue))" }
    if let error = response["errorMessage"] ?? response["error"] { return compactText(error, 84) }
    if let files = response["files"] as? [Any] { return "\(files.count) 个文件" }
    if response["content"] != nil { return "已返回内容" }
    return ""
}

func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

func buildHint(
    event: [String: Any],
    selection: [String: String],
    config: [String: Any],
    state: [String: Any]
) -> [String: Any] {
    let eventName = string(event["hook_event_name"]).isEmpty ? "Manual" : string(event["hook_event_name"])
    let toolName = string(event["tool_name"])
    let privacy = object(config["privacy"])
    let pet = object(config["pet"])
    var summary: String? = nil
    if eventName == "UserPromptSubmit" {
        summary = bool(privacy["showPromptText"]) && !string(event["prompt"]).isEmpty
            ? compactText(event["prompt"], 96) : "用户提交了请求"
    } else {
        let value = inputSummary(event, privacy)
        if !value.isEmpty { summary = value }
    }
    var result: String? = nil
    if !["PreToolUse", "UserPromptSubmit", "SessionStart"].contains(eventName) {
        let value = resultSummary(event)
        if !value.isEmpty { result = value }
    }
    let promptText = bool(privacy["showPromptText"]) && !string(event["prompt"]).isEmpty
        ? compactText(event["prompt"], 84) : "用户提交了请求"
    let reason = selection["reason"] ?? ""
    let vars = [
        "petName": string(pet["displayName"]), "tool": toolName,
        "summary": eventName == "UserPromptSubmit" ? promptText : (summary ?? ""),
        "result": result ?? summary ?? "请查看工具输出", "event": eventName, "reason": reason,
    ]
    let text = object(state["text"])
    let label = string(state["label"])
    let rawTitle = interpolate(string(text["title"]).isEmpty ? label : string(text["title"]), vars)
    let rawMessage = interpolate(string(text["message"]).isEmpty ? "{reason}" : string(text["message"]), vars)
    let detail: String
    if eventName == "PreToolUse" { detail = toolName.isEmpty ? "工具调用前" : "调用前 · \(toolName)" }
    else if eventName == "PostToolUse" { detail = toolName.isEmpty ? "工具调用后" : "调用后 · \(toolName)" }
    else if eventName == "UserPromptSubmit" { detail = "用户输入" }
    else { detail = eventName }
    let failed = toolFailed(event)
    return [
        "title": compactText(rawTitle.isEmpty ? label : rawTitle, 42),
        "message": compactText(rawMessage.isEmpty ? reason : rawMessage, 96),
        "detail": compactText(detail, 64),
        "severity": failed ? "error" : string(state["severity"]),
        "event": eventName,
        "toolName": toolName.isEmpty ? NSNull() : toolName,
        "eventLabel": string(event["hook_event_name"]).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? NSNull() : string(event["hook_event_name"]).trimmingCharacters(in: .whitespacesAndNewlines),
        "toolLabel": toolName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? NSNull() : toolName.trimmingCharacters(in: .whitespacesAndNewlines),
        "summary": summary ?? NSNull(),
        "result": result ?? NSNull(),
        "persistent": failed || string(state["severity"]) == "error",
        "ttlMs": string(state["id"]) == "idle" ? 3500 : 9000,
        "updatedAt": isoNow(),
    ]
}

let input = FileHandle.standardInput.readDataToEndOfFile()
if input.isEmpty { fail("empty input") }
if input.count > maxInputBytes { fail("input too large") }
let raw: Any
do {
    raw = try JSONSerialization.jsonObject(with: input)
} catch {
    fail("invalid JSON")
}
guard let request = raw as? [String: Any],
      string(request["schema"]) == requestSchema,
      (request["version"] as? NSNumber)?.intValue == 1,
      let event = request["event"] as? [String: Any],
      let config = request["config"] as? [String: Any],
      let states = request["states"] as? [[String: Any]] else {
    fail("invalid schema")
}
let selection = selectAction(event)
let stateName = selection["name"] ?? "idle"
guard let state = states.first(where: { string($0["id"]) == stateName })
        ?? states.first(where: { string($0["id"]) == "idle" })
        ?? states.first else {
    fail("missing state")
}
let response: [String: Any] = [
    "schema": responseSchema,
    "version": 1,
    "selection": selection,
    "hint": buildHint(event: event, selection: selection, config: config, state: state),
]
do {
    let data = try JSONSerialization.data(withJSONObject: response, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    fail("output encoding failed", 3)
}

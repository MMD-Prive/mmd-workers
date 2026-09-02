from pathlib import Path

path = Path("admin-worker/src/kenji-control-actions.js")
text = path.read_text()
replacements = {
    'if (operation === "approval_decision") return approvalDecision(': 'if (operation === "approval_decision") return await approvalDecision(',
    'if (operation === "conversation_takeover") return conversationTakeover(': 'if (operation === "conversation_takeover") return await conversationTakeover(',
    'if (operation === "message_draft") return createMessageDraft(': 'if (operation === "message_draft") return await createMessageDraft(',
    '    return updateKillSwitch(': '    return await updateKillSwitch(',
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f"expected one dispatch anchor for {old!r}, found {text.count(old)}")
    text = text.replace(old, new, 1)
path.write_text(text)

// Recovered from live version 43f372c1; keep reconciliation semantics intact.
export const CustomerRequestMutationCoordinator = class {
    constructor(state) {
      this.state = state;
    }
    async fetch(request) {
      const body = await request.json().catch(() => null);
      if (!body?.action || body.action !== "inspect" && !body.operation_id) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
      return this.state.blockConcurrencyWhile(async () => {
        const current = await this.state.storage.get("lease");
        if (body.action === "inspect") return Response.json({ ok: true, lease: current || null });
        if (body.action === "begin") {
          if (current && current.operation_id !== body.operation_id) return Response.json({ ok: false, error: current.status === "uncertain" ? "REQUEST_MUTATION_UNCERTAIN" : "REQUEST_MUTATION_IN_FLIGHT" }, { status: 409 });
          if (current) {
            if (current.status === "uncertain" || current.status === "writing" || current.stage === "write_started") return Response.json({ ok: false, error: "REQUEST_MUTATION_RECONCILE_REQUIRED" }, { status: 409 });
            const fingerprint = body.mutation_fingerprint || `operation:${body.operation_id}`;
            if (current.mutation_fingerprint !== fingerprint) return Response.json({ ok: false, error: "REQUEST_MUTATION_FINGERPRINT_MISMATCH" }, { status: 409 });
            return Response.json({ ok: true, lease: current.operation_id });
          }
          const lease = { operation_id: body.operation_id, status: "pending", mutation_fingerprint: body.mutation_fingerprint || `operation:${body.operation_id}`, started_at: Date.now() };
          await this.state.storage.put("lease", lease);
          return Response.json({ ok: true, lease: body.operation_id });
        }
        if (body.action === "prepare") {
          if (!current || current.operation_id !== body.operation_id || current.status === "uncertain" || !body.mutation_fingerprint) return Response.json({ ok: false, error: "REQUEST_MUTATION_LEASE_LOST" }, { status: 409 });
          current.mutation_fingerprint = String(body.mutation_fingerprint);
          current.stage = "prepared";
          await this.state.storage.put("lease", current);
          return Response.json({ ok: true, prepared: true });
        }
        if (body.action === "write_started") {
          if (!current || current.operation_id !== body.operation_id || current.stage !== "prepared" || current.mutation_fingerprint !== body.mutation_fingerprint) return Response.json({ ok: false, error: "REQUEST_MUTATION_LEASE_LOST" }, { status: 409 });
          current.status = "writing";
          current.stage = "write_started";
          await this.state.storage.put("lease", current);
          return Response.json({ ok: true, write_started: true });
        }
        if (body.action === "resume") {
          if (!current || current.operation_id !== body.operation_id || current.status !== "uncertain" && current.status !== "writing" || current.stage !== "write_started" || current.current_item || current.mutation_fingerprint !== body.mutation_fingerprint) return Response.json({ ok: false, error: "REQUEST_MUTATION_RESUME_BLOCKED" }, { status: 409 });
          current.status = "writing";
          await this.state.storage.put("lease", current);
          return Response.json({ ok: true, resumed: true, completed_keys: current.completed_keys || [] });
        }
        if (body.action === "item_started") {
          if (!current || current.operation_id !== body.operation_id || current.status !== "writing" || current.mutation_fingerprint !== body.mutation_fingerprint || !body.item_key || current.current_item) return Response.json({ ok: false, error: "REQUEST_MUTATION_ITEM_IN_FLIGHT" }, { status: 409 });
          current.current_item = String(body.item_key);
          current.item_started_at = Date.now();
          await this.state.storage.put("lease", current);
          return Response.json({ ok: true, item_started: current.current_item });
        }
        if (body.action === "mark_item") {
          if (!current || current.operation_id !== body.operation_id || current.status !== "writing" || current.mutation_fingerprint !== body.mutation_fingerprint || !body.item_key || current.current_item !== String(body.item_key)) return Response.json({ ok: false, error: "REQUEST_MUTATION_LEASE_LOST" }, { status: 409 });
          current.completed_keys = [.../* @__PURE__ */ new Set([...current.completed_keys || [], String(body.item_key)])];
          delete current.current_item;
          delete current.item_started_at;
          await this.state.storage.put("lease", current);
          return Response.json({ ok: true, completed_keys: current.completed_keys });
        }
        if (body.action === "reconcile_item") {
          if (!current || current.operation_id !== body.operation_id || current.status !== "uncertain" || current.stage !== "write_started" || current.mutation_fingerprint !== body.mutation_fingerprint || !body.item_key || current.current_item !== String(body.item_key) || body.readback_verified !== true) return Response.json({ ok: false, error: "REQUEST_MUTATION_ITEM_RECONCILE_REQUIRED" }, { status: 409 });
          current.completed_keys = [.../* @__PURE__ */ new Set([...current.completed_keys || [], String(body.item_key)])];
          delete current.current_item;
          delete current.item_started_at;
          await this.state.storage.put("lease", current);
          return Response.json({ ok: true, reconciled_item: String(body.item_key), completed_keys: current.completed_keys });
        }
        if (body.action === "finish") {
          if (!current || current.operation_id !== body.operation_id) return Response.json({ ok: false, error: "REQUEST_MUTATION_LEASE_LOST" }, { status: 409 });
          if (body.mutation_fingerprint && current.mutation_fingerprint !== body.mutation_fingerprint) return Response.json({ ok: false, error: "REQUEST_MUTATION_FINGERPRINT_MISMATCH" }, { status: 409 });
          if (body.status === "uncertain") {
            current.status = "uncertain";
            await this.state.storage.put("lease", current);
            return Response.json({ ok: true, completed: "uncertain" });
          }
          if (body.status === "aborted") {
            if (current.stage === "write_started" || current.status === "writing") return Response.json({ ok: false, error: "REQUEST_MUTATION_RECONCILE_REQUIRED" }, { status: 409 });
            await this.state.storage.delete("lease");
            return Response.json({ ok: true, completed: "aborted" });
          }
          if (current.status === "uncertain") return Response.json({ ok: false, error: "REQUEST_MUTATION_RECONCILE_REQUIRED" }, { status: 409 });
          await this.state.storage.delete("lease");
          return Response.json({ ok: true, completed: "committed" });
        }
        if (body.action === "reconcile" && current?.stage === "write_started" && (current.status === "writing" || current.status === "uncertain") && current.operation_id === body.operation_id && body.readback_verified === true && body.mutation_fingerprint && current.mutation_fingerprint === body.mutation_fingerprint) {
          await this.state.storage.delete("lease");
          return Response.json({ ok: true, reconciled: true });
        }
        return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
      });
    }
  };

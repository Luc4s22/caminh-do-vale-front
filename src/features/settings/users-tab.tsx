import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Mail, Pencil, Plus, ShieldCheck, ShieldOff, UserPlus, Users } from "lucide-react";
import { Badge, Button, Card, Dialog, EmptyState, FormError, Input, Select, Skeleton } from "@/components/ui";
import { CopyButton } from "@/features/auth/two-factor";
import { useSession } from "@/hooks/use-session";
import {
  createUser,
  listUsers,
  resendInvite,
  resetTwoFactor,
  updateUser,
  type AssignableRole,
} from "@/services/api/admin-api";
import type { ApiInviteResult, ApiManagedUser } from "@/services/api/backend-types";
import { formatDateTime } from "@/utils/format";
import { roleLabels } from "@/utils/roles";

const USERS_KEY = ["admin-users"];

const assignableRoles: { value: AssignableRole; label: string }[] = [
  { value: "seller", label: "Vendedor" },
  { value: "buyer", label: "Comprador" },
  { value: "driver", label: "Motorista" },
  { value: "admin", label: "Administrador" },
];

/** Result of creating a user or resending the invite. */
function InviteNotice({ email, result }: { email: string; result: ApiInviteResult }) {
  if (result.password_setup_link) {
    return (
      <div className="mt-4 space-y-2 rounded-xl border border-[#F2C94C]/60 bg-[#FDF6DC] p-3 text-sm text-[#123A24]">
        <p className="font-semibold">O e-mail não foi enviado. Mande este link para a pessoa (por WhatsApp, por exemplo):</p>
        <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-xs" title={result.password_setup_link}>
            {result.password_setup_link}
          </code>
          <CopyButton text={result.password_setup_link} label="Copiar link" />
        </div>
        <p className="text-xs text-[#5B7264]">Ele vale 3 dias e só pode ser usado uma vez. Com ele a pessoa define a própria senha.</p>
      </div>
    );
  }
  if (result.invite_sent) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#E6F4EA] px-3 py-2 text-sm text-[#1A7A44]" role="status">
        <Mail className="h-4 w-4 shrink-0" />
        Convite enviado para {email}. O link vale 3 dias.
      </p>
    );
  }
  return (
    <p className="mt-4 rounded-lg bg-[#FEF3E6] px-3 py-2 text-sm text-[#9A5B12]" role="status">
      O convite não saiu por e-mail e o servidor não gerou o link. Peça para configurarem a PASSWORD_RESET_URL no back.
    </p>
  );
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", role: "seller" as AssignableRole });
  const create = useMutation({
    mutationFn: () => createUser({ name: form.name.trim(), email: form.email.trim(), role: form.role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim() && form.email.trim()) create.mutate();
  }

  if (create.data) {
    return (
      <Dialog title="Usuário criado" description={`${create.data.user.name} · ${roleLabels[form.role]}`} onClose={onClose}>
        <InviteNotice email={create.data.user.email} result={create.data} />
        <p className="mt-3 text-xs text-[#5B7264]">
          No primeiro login a pessoa também configura o aplicativo autenticador (2FA).
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Concluir</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Novo usuário"
      description="A conta nasce sem senha: a pessoa recebe um convite e define a própria senha."
      onClose={onClose}
      busy={create.isPending}
    >
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <Input id="user-name" label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <Input id="user-email" label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Select
          id="user-role"
          label="Papel"
          options={assignableRoles}
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as AssignableRole })}
        />
        {create.error && <FormError>{create.error.message}</FormError>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending || !form.name.trim() || !form.email.trim()}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Criar e enviar convite
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditUserDialog({ user, isSelf, onClose }: { user: ApiManagedUser; isSelf: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const currentRole = user.role && user.role in roleLabels ? user.role : null;
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<string>(currentRole ?? "");
  const [active, setActive] = useState(user.is_active);
  const save = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        ...(name.trim() !== user.name ? { name: name.trim() } : {}),
        ...(role && role !== currentRole ? { role: role as AssignableRole } : {}),
        ...(active !== user.is_active ? { is_active: active } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      onClose();
    },
  });

  // Operator and viewer exist only for old accounts; they can be changed to one of the four, not picked.
  const roleOptions = [
    ...(currentRole && !assignableRoles.some((r) => r.value === currentRole)
      ? [{ value: currentRole, label: roleLabels[currentRole] }]
      : []),
    ...assignableRoles,
  ];

  return (
    <Dialog title="Editar usuário" description={user.email} onClose={onClose} busy={save.isPending}>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        noValidate
      >
        <Input id="edit-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select
          id="edit-role"
          label="Papel"
          options={roleOptions}
          placeholder="Sem papel"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isSelf}
        />
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-[#F4FAF5] px-3 py-2 text-sm text-[#123A24]">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={isSelf}
            className="mt-0.5 h-4 w-4 accent-[#1A7A44]"
          />
          <span>
            Conta ativa
            <span className="block text-xs text-[#5B7264]">Desativar bloqueia o login e encerra as sessões abertas.</span>
          </span>
        </label>
        {isSelf && <p className="text-xs text-[#5B7264]">Você não pode trocar o papel nem desativar a sua própria conta.</p>}
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InviteDialog({ user, onClose }: { user: ApiManagedUser; onClose: () => void }) {
  const invite = useMutation({ mutationFn: () => resendInvite(user.id) });
  return (
    <Dialog
      title="Reenviar convite"
      description={`Um link novo para ${user.name} definir a senha. O link anterior deixa de valer.`}
      onClose={onClose}
      busy={invite.isPending}
    >
      {invite.data ? (
        <InviteNotice email={user.email} result={invite.data} />
      ) : (
        invite.error && <FormError>{invite.error.message}</FormError>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={invite.isPending}>
          {invite.data ? "Fechar" : "Cancelar"}
        </Button>
        {!invite.data && (
          <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
            {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Reenviar
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function ResetTwoFactorDialog({ user, onClose }: { user: ApiManagedUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const reset = useMutation({
    mutationFn: () => resetTwoFactor(user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
  return (
    <Dialog
      title="Resetar 2FA"
      description={`Use quando ${user.name} perdeu o celular. No próximo login a pessoa cadastra o autenticador de novo.`}
      onClose={onClose}
      busy={reset.isPending}
    >
      {reset.data && (
        <p className="mt-4 rounded-lg bg-[#E6F4EA] px-3 py-2 text-sm text-[#1A7A44]" role="status">
          {reset.data}
        </p>
      )}
      {reset.error && <FormError>{reset.error.message}</FormError>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={reset.isPending}>
          {reset.data ? "Fechar" : "Cancelar"}
        </Button>
        {!reset.data && (
          <Button variant="danger" onClick={() => reset.mutate()} disabled={reset.isPending}>
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
            Resetar 2FA
          </Button>
        )}
      </div>
    </Dialog>
  );
}

type Action = { kind: "edit" | "invite" | "reset"; user: ApiManagedUser };

function StatusBadges({ user }: { user: ApiManagedUser }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.is_active ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Desativado</Badge>}
      {!user.has_password && <Badge variant="warning">Convite pendente</Badge>}
      {user.has_2fa ? (
        <Badge variant="info">
          <ShieldCheck className="h-3 w-3" /> 2FA
        </Badge>
      ) : (
        user.has_password && <Badge variant="muted">Sem 2FA</Badge>
      )}
    </div>
  );
}

function RowActions({ user, onAction }: { user: ApiManagedUser; onAction: (a: Action) => void }) {
  const btn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1A7A44] hover:bg-[#E6F4EA]";
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <button type="button" className={btn} onClick={() => onAction({ kind: "edit", user })}>
        <Pencil className="h-3.5 w-3.5" /> Editar
      </button>
      {!user.has_password && user.is_active && (
        <button type="button" className={btn} onClick={() => onAction({ kind: "invite", user })}>
          <Mail className="h-3.5 w-3.5" /> Reenviar convite
        </button>
      )}
      {user.has_2fa && (
        <button type="button" className={btn} onClick={() => onAction({ kind: "reset", user })}>
          <KeyRound className="h-3.5 w-3.5" /> Resetar 2FA
        </button>
      )}
    </div>
  );
}

export function UsersTab() {
  const me = useSession()?.user.id;
  const { data: users, isLoading, error } = useQuery({ queryKey: USERS_KEY, queryFn: listUsers });
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const visible = (users ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  const pending = (users ?? []).filter((u) => !u.has_password).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#123A24]">Usuários</h2>
          <p className="text-sm text-[#5B7264]">
            Crie contas, ajuste papéis e ajude quem perdeu o celular.
            {pending > 0 && ` ${pending} convite${pending > 1 ? "s" : ""} pendente${pending > 1 ? "s" : ""}.`}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <Input search placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuários" value={search} onChange={(e) => setSearch(e.target.value)} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Users} title="Não foi possível carregar os usuários" description={error.message} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuário encontrado" description={q ? "Tente outro nome ou e-mail." : "Crie o primeiro usuário."} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-[#E6F4EA] bg-white md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6F4EA] text-left text-xs text-[#5B7264]">
                  <th className="px-4 py-2.5 font-medium">Nome</th>
                  <th className="px-4 py-2.5 font-medium">Papel</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5 font-medium">Último acesso</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} className="border-b border-[#F4FAF5] last:border-0 hover:bg-[#F4FAF5]/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#123A24]">
                        {u.name}
                        {u.id === me && <span className="ml-1.5 text-xs font-normal text-[#5B7264]">(você)</span>}
                      </p>
                      <p className="text-xs text-[#5B7264]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-[#123A24]">{u.role ? roleLabels[u.role] : "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadges user={u} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[#5B7264]">{u.last_login ? formatDateTime(u.last_login) : "Nunca"}</td>
                    <td className="px-4 py-3">
                      <RowActions user={u} onAction={setAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {visible.map((u) => (
              <Card key={u.id} className="space-y-2 p-4">
                <div>
                  <p className="font-medium text-[#123A24]">
                    {u.name}
                    {u.id === me && <span className="ml-1.5 text-xs font-normal text-[#5B7264]">(você)</span>}
                  </p>
                  <p className="text-xs text-[#5B7264]">
                    {u.email} · {u.role ? roleLabels[u.role] : "Sem papel"}
                  </p>
                </div>
                <StatusBadges user={u} />
                <RowActions user={u} onAction={setAction} />
              </Card>
            ))}
          </div>
        </>
      )}

      {creating && <NewUserDialog onClose={() => setCreating(false)} />}
      {action?.kind === "edit" && <EditUserDialog user={action.user} isSelf={action.user.id === me} onClose={() => setAction(null)} />}
      {action?.kind === "invite" && <InviteDialog user={action.user} onClose={() => setAction(null)} />}
      {action?.kind === "reset" && <ResetTwoFactorDialog user={action.user} onClose={() => setAction(null)} />}
    </div>
  );
}

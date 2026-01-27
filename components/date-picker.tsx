"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DatePickerProps = {
  date: Date | undefined;
  onChange: (date: Date | undefined) => void;

  placeholder?: string;
  className?: string;

  allowClear?: boolean;
  allowToday?: boolean;

  /** permite digitar manualmente (dd/MM/aaaa) */
  allowManualInput?: boolean;
};

function fmt(d: Date) {
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

function parseBR(value: string): Date | null {
  // aceita dd/MM/aaaa
  const d = parse(value, "dd/MM/yyyy", new Date(), { locale: ptBR });
  if (!isValid(d)) return null;

  // garante que o usuário não digitou "32/01/2026" e virou outra data
  const normalized = fmt(d);
  if (normalized !== value) return null;

  return d;
}

export function DatePicker({
  date,
  onChange,
  placeholder = "Selecione uma data",
  className,
  allowClear = false,
  allowToday = true,
  allowManualInput = true,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // valor digitado
  const [text, setText] = React.useState<string>(date ? fmt(date) : "");
  const [error, setError] = React.useState<string | null>(null);

  // sincroniza quando a data externa muda (ex: vindo do DB)
  React.useEffect(() => {
    setText(date ? fmt(date) : "");
    setError(null);
  }, [date]);

  function applyText(value: string) {
    const v = value.trim();

    // permitir limpar campo digitando vazio (só se allowClear)
    if (v === "") {
      if (allowClear) {
        setError(null);
        onChange(undefined);
      } else {
        setError("Campo obrigatório.");
      }
      return;
    }

    const parsed = parseBR(v);
    if (!parsed) {
      setError("Data inválida. Use dd/MM/aaaa.");
      return;
    }

    setError(null);
    onChange(parsed);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Input manual */}
      {allowManualInput && (
        <div className="flex flex-col">
          <input
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              // não valida a cada tecla, só limpa erro se está indo na direção certa
              if (error) setError(null);
            }}
            onBlur={() => applyText(text)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyText(text);
              }
            }}
            placeholder="dd/MM/aaaa"
            className={cn(
              "w-35 rounded-md border px-3 py-2 text-sm outline-none",
              "bg-white text-zinc-900 border-zinc-300",
              error ? "border-red-500" : "focus:border-zinc-500"
            )}
          />
          {error && <span className="text-xs text-red-600 mt-1">{error}</span>}
        </div>
      )}

      {/* Botão abre calendário */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-60 justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
            type="button"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? fmt(date) : placeholder}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-auto p-0 bg-white text-zinc-900 border border-zinc-200 shadow-xl rounded-lg"
        >
          {/* ✅ altura/largura fixa para não “pular” ao trocar de mês */}
          <div className="w-[320px] h-85 flex items-start justify-center p-2">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                // d é Date | undefined no day-picker v9
                onChange(d);
                // atualiza input também
                setText(d ? fmt(d) : "");
                setError(null);
              }}
              required={false}
              initialFocus
              locale={ptBR}
              className="bg-white text-zinc-900"
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Botões auxiliares */}
      {allowClear && (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(undefined)}
          disabled={!date}
        >
          Limpar
        </Button>
      )}

      {allowToday && (
        <Button type="button" variant="secondary" onClick={() => onChange(new Date())}>
          Hoje
        </Button>
      )}
    </div>
  );
}

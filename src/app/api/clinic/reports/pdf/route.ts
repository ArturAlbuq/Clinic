import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  buildAttendantReport,
  buildReceptionReport,
  buildRoomReportItems,
  getAdminPeriodLabel,
  groupRoomReportItemsByExam,
} from "@/lib/admin-report";
import { requireRole } from "@/lib/auth";
import { EXAM_LABELS, ROOM_BY_SLUG, type RoomSlug } from "@/lib/constants";
import {
  fetchAttendances,
  fetchExamRooms,
  fetchQueueItems,
  getRangeBounds,
  parseDateInput,
  parseQueuePeriod,
} from "@/lib/queue";

export const runtime = "nodejs";

const PAGE = {
  height: 842,
  margin: 48,
  width: 595,
};

const FONT = {
  normal: 11,
  section: 14,
  small: 9,
  title: 18,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = parseQueuePeriod(searchParams.get("period") ?? undefined);
  const selectedDate = parseDateInput(searchParams.get("date") ?? undefined);
  const patientNameFilter = searchParams.get("patientName")?.trim() ?? "";
  const normalizedPatientNameFilter =
    patientNameFilter.toLocaleLowerCase("pt-BR");
  const roomSlugParam = searchParams.get("roomSlug");
  const roomFilter =
    roomSlugParam === "fotografia-escaneamento" ||
    roomSlugParam === "periapical" ||
    roomSlugParam === "panoramico" ||
    roomSlugParam === "tomografia"
      ? roomSlugParam
      : "todas";

  const { supabase } = await requireRole("admin");
  const range = getRangeBounds(period, selectedDate);
  const [{ data: profiles }, attendances, queueItems, rooms] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name", { ascending: true }),
    fetchAttendances(supabase, { range }),
    fetchQueueItems(supabase, { range }),
    fetchExamRooms(supabase),
  ]);

  const attendantReport = buildAttendantReport({
    attendances,
    profiles: (profiles ?? []).map((profile) => profile),
    queueItems,
  });
  const receptionReport = buildReceptionReport({
    attendances,
    profiles: (profiles ?? []).map((profile) => profile),
  });
  const roomReportItems = buildRoomReportItems({
    attendances,
    queueItems,
    roomFilter,
  }).filter((item) =>
    normalizedPatientNameFilter
      ? (item.attendance?.patient_name ?? item.patient_name ?? "")
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedPatientNameFilter)
      : true,
  );
  const groupedByExam = groupRoomReportItemsByExam(roomReportItems, roomFilter);
  const periodLabel = getAdminPeriodLabel(period, selectedDate.toISOString().slice(0, 10));
  const roomLabel =
    roomFilter === "todas"
      ? "Todas as salas"
      : rooms.find((room) => room.slug === roomFilter)?.name ??
        ROOM_BY_SLUG[roomFilter].roomName;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const drawLine = (
    text: string,
    options?: {
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
      size?: number;
    },
  ) => {
    const size = options?.size ?? FONT.normal;
    const lines = wrapText(text, 92);

    for (const line of lines) {
      if (y < PAGE.margin + 24) {
        page = pdf.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - PAGE.margin;
      }

      page.drawText(line, {
        color: options?.color ?? rgb(0.15, 0.18, 0.23),
        font: options?.bold ? fontBold : font,
        size,
        x: PAGE.margin,
        y,
      });
      y -= size + 5;
    }

    y -= options?.gapAfter ?? 4;
  };

  drawLine("Relatórios da clínica", {
    bold: true,
    color: rgb(0.02, 0.26, 0.4),
    gapAfter: 8,
    size: FONT.title,
  });
  drawLine(`Período: ${periodLabel}`, { bold: true });
  drawLine(`Sala: ${roomLabel}`, { gapAfter: patientNameFilter ? 4 : 10 });
  if (patientNameFilter) {
    drawLine(`Paciente: ${patientNameFilter}`, { gapAfter: 10 });
  }

  drawSectionTitle(drawLine, "Resumo por exame");
  if (groupedByExam.length) {
    for (const entry of groupedByExam) {
      const entryRoom = ROOM_BY_SLUG[entry.roomSlug].roomName;
      drawLine(
        `${EXAM_LABELS[entry.examType]} | sala ${entryRoom} | itens ${entry.totalItems} | quantidade ${entry.totalQuantity} | aguardando ${entry.waitingCount}`,
      );
    }
  } else {
    drawLine("Sem registros no recorte selecionado.");
  }

  drawSectionTitle(drawLine, "Atendimento por operador");
  if (attendantReport.length) {
    for (const entry of attendantReport) {
      drawLine(entry.profile.full_name, { bold: true });
      drawLine(
        `Chamadas ${entry.calledCount} | etapas concluídas ${entry.finishedCount} | cancelamentos ${entry.canceledCount}`,
      );
      drawLine(
        `Tempo para chamar ${formatPdfMinutes(entry.avgCallMinutes)} | tempo em exame ${formatPdfMinutes(entry.avgExecutionMinutes)} | tempo total ${formatPdfMinutes(entry.avgStageTotalMinutes)}`,
        { gapAfter: 6 },
      );
    }
  } else {
    drawLine("Nenhum atendente com movimentação neste recorte.");
  }

  drawSectionTitle(drawLine, "Cadastros da recepção");
  if (receptionReport.length) {
    for (const entry of receptionReport) {
      drawLine(`${entry.profile.full_name} | cadastros ${entry.createdCount}`);
    }
  } else {
    drawLine("Nenhum cadastro de recepção neste recorte.");
  }

  drawSectionTitle(drawLine, "Itens por sala e data");
  if (roomReportItems.length) {
    for (const item of roomReportItems) {
      const patientName = item.attendance?.patient_name ?? item.patient_name ?? "Paciente";
      drawLine(
        `${patientName} | ${EXAM_LABELS[item.exam_type]} | ${ROOM_BY_SLUG[item.room_slug as RoomSlug]?.roomName ?? item.room_slug} | status ${item.status} | qtd. ${item.requested_quantity}`,
      );
      drawLine(`Entrada ${new Date(item.created_at).toLocaleString("pt-BR")}`, {
        color: rgb(0.35, 0.4, 0.48),
        gapAfter: 5,
        size: FONT.small,
      });
    }
  } else {
    drawLine("Nenhum item para a sala selecionada.");
  }

  const bytes = await pdf.save();
  const filename = `relatorios-clinica-${selectedDate.toISOString().slice(0, 10)}.pdf`;
  const body = Buffer.from(bytes);

  return new NextResponse(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/pdf",
    },
  });
}

function drawSectionTitle(
  drawLine: (
    text: string,
    options?: {
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
      size?: number;
    },
  ) => void,
  title: string,
) {
  drawLine(title, {
    bold: true,
    color: rgb(0.02, 0.26, 0.4),
    gapAfter: 6,
    size: FONT.section,
  });
}

function wrapText(text: string, maxLength: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [text];
}

function formatPdfMinutes(value: number | null) {
  return value === null ? "--" : `${value} min`;
}


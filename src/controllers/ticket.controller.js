const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Generate a unique ticket number
const generateTicketNumber = async () => {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  const lastTicket = await prisma.ticket.findFirst({
    where: { ticketNumber: { startsWith: `TKT-${dateStr}` } },
    orderBy: { ticketNumber: 'desc' }
  });

  let nextSequence = 1;
  if (lastTicket) {
    const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[2], 10);
    nextSequence = lastSequence + 1;
  }
  
  return `TKT-${dateStr}-${nextSequence.toString().padStart(4, '0')}`;
};

exports.getAll = async (req, res) => {
  try {
    const isAdmin = req.user.role.name === 'Admin';
    
    // Construct the where clause based on role
    const whereClause = isAdmin ? {} : { requesterId: req.user.id };

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: {
        requester: { select: { id: true, fullName: true, username: true } },
        assignee: { select: { id: true, fullName: true, username: true } },
        category: true,
        department: true
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: "Error fetching tickets", error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        requester: { select: { id: true, fullName: true, username: true } },
        assignee: { select: { id: true, fullName: true, username: true } },
        category: true,
        department: true,
        comments: {
          include: {
            user: { select: { id: true, fullName: true, username: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: "Error fetching ticket", error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, description, priority, categoryId, departmentId } = req.body;
    const ticketNumber = await generateTicketNumber();

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title,
        description,
        priority: priority || 'LOW',
        categoryId: parseInt(categoryId),
        departmentId: departmentId ? parseInt(departmentId) : null,
        requesterId: req.user.id
      },
    });
    
    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: { name: { in: ['Admin', 'Super Admin'] } } }
    });
    
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(admin => ({
          userId: admin.id,
          title: "New Ticket Created",
          message: `Ticket ${ticketNumber} has been created by ${req.user.fullName || 'a user'}.`,
          link: `/tickets/detail/${ticket.id}`
        }))
      });
    }

    res.status(201).json(ticket);
  } catch (error) {
    res.status(500).json({ message: "Error creating ticket", error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { title, description, status, priority, categoryId, departmentId, assigneeId } = req.body;
    
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (categoryId !== undefined) updateData.categoryId = parseInt(categoryId);
    
    if ('departmentId' in req.body) {
      updateData.departmentId = departmentId ? parseInt(departmentId) : null;
    }
    if ('assigneeId' in req.body) {
      updateData.assigneeId = assigneeId ? parseInt(assigneeId) : null;
    }

    if (status === 'RESOLVED') updateData.resolvedAt = new Date();
    if (status === 'CLOSED') updateData.closedAt = new Date();

    const ticket = await prisma.ticket.update({
      where: { id: parseInt(req.params.id) },
      data: updateData,
    });
    
    // Send notifications if status changed
    if (status !== undefined) {
      await prisma.notification.create({
        data: {
          userId: ticket.requesterId,
          title: "Ticket Status Updated",
          message: `Your ticket ${ticket.ticketNumber} status has changed to ${status.replace(/_/g, " ")}.`,
          link: `/portal/tickets/${ticket.id}`
        }
      });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: "Error updating ticket", error: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await prisma.ticket.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting ticket", error: error.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const { content } = req.body;
    const ticketId = parseInt(req.params.id);
    const userId = req.user.id;

    const comment = await prisma.ticket_comment.create({
      data: {
        content,
        ticketId,
        userId
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        ticket: true
      }
    });
    
    // Notification logic for comments
    const ticket = comment.ticket;
    const isRequester = userId === ticket.requesterId;
    
    if (isRequester && ticket.assigneeId) {
      // User commented, notify assignee
      await prisma.notification.create({
        data: {
          userId: ticket.assigneeId,
          title: "New Comment on Ticket",
          message: `${comment.user.fullName} added a comment on ticket ${ticket.ticketNumber}.`,
          link: `/tickets/detail/${ticket.id}`
        }
      });
    } else if (!isRequester) {
      // Admin commented, notify user
      await prisma.notification.create({
        data: {
          userId: ticket.requesterId,
          title: "New Reply on Your Ticket",
          message: `You have a new reply on ticket ${ticket.ticketNumber}.`,
          link: `/portal/tickets/${ticket.id}`
        }
      });
    }

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Error adding comment", error: error.message });
  }
};

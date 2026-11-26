import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { AddMembersDto, CreateEmailGroupDto, RenameEmailGroupDto } from './dto/email-group.dto';
import { EmailGroupsService } from './email-groups.service';

@Controller('email-groups')
export class EmailGroupsController {
  constructor(private readonly svc: EmailGroupsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body() dto: CreateEmailGroupDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  rename(@Param('id', ParseIntPipe) id: number, @Body() dto: RenameEmailGroupDto) {
    return this.svc.rename(id, dto);
  }

  @Post(':id/members')
  @HttpCode(200)
  addMembers(@Param('id', ParseIntPipe) id: number, @Body() dto: AddMembersDto) {
    return this.svc.addMembers(id, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(204)
  removeMember(@Param('id', ParseIntPipe) id: number, @Param('memberId', ParseIntPipe) memberId: number) {
    return this.svc.removeMember(id, memberId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}

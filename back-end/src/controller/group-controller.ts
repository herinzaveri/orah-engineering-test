import { getRepository } from "typeorm"
import { NextFunction, Request, Response } from "express"
import { Group } from "../entity/group.entity"
import { CreateGroupInput, UpdateGroupInput } from "../interface/group.interface"
import { StudentRollState } from "../entity/student-roll-state.entity"
import moment = require("moment")
import { GroupStudent } from "../entity/group-student.entity"
import { CreateStudentGroupInput } from "../interface/student-group.interface"

export class GroupController {
  private groupRepository = getRepository(Group)
  private studentRollStateRepository = getRepository(StudentRollState)
  private groupStudentRepository = getRepository(GroupStudent)

  async allGroups(request: Request, response: Response, next: NextFunction) {
    // Task 1:

    // Return the list of all groups
    return this.groupRepository.find()
  }

  async createGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1:

    // Add a Group
    const { body: params } = request

    if (!this.validateRollStates(params.roll_states) || !this.validateLtmt(params.ltmt)) {
      return {
        message: "Invalid Input",
      }
    }

    const createGroupInput: CreateGroupInput = {
      name: params.name,
      number_of_weeks: params.number_of_weeks,
      roll_states: params.roll_states,
      incidents: params.incidents,
      ltmt: params.ltmt,
      student_count: 0,
    }

    const group = new Group()
    group.prepareToCreate(createGroupInput)

    return this.groupRepository.save(group)
  }

  async updateGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Update a Group
    const { body: params = {} } = request

    if (!params.id) return {}

    const group = await this.groupRepository.findOne(params.id)

    if (!group) return {}

    const updateGroupInput: UpdateGroupInput = {
      id: params.id,
      name: params.name || group.name,
      number_of_weeks: params.number_of_weeks || group.number_of_weeks,
      roll_states: params.roll_states || group.roll_states,
      incidents: params.incidents || group.incidents,
      ltmt: params.ltmt || group.ltmt,
      student_count: group.student_count,
    }

    if (!this.validateRollStates(updateGroupInput.roll_states) || !this.validateLtmt(updateGroupInput.ltmt)) {
      return {
        message: "Invalid Input",
      }
    }

    group.prepareToUpdate(updateGroupInput)

    return this.groupRepository.save(group)
  }

  async removeGroup(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Delete a Group
    const groupToRemove = await this.groupRepository.findOne(request.params.id)
    if (!groupToRemove) return {}
    return this.groupRepository.remove(groupToRemove)
  }

  async getGroupStudents(request: Request, response: Response, next: NextFunction) {
    // Task 1:
    // Return the list of Students that are in a Group
    return await this.groupStudentRepository.query(`
      SELECT s.id AS id, first_name, last_name,
        (first_name || ' ' || last_name) AS full_name
      FROM group_student AS gs
      JOIN student AS s
        ON s.id = gs.student_id
      GROUP BY s.id
    `)
  }

  async getGroupStudentsById(request: Request, response: Response, next: NextFunction) {
    return await this.groupStudentRepository.query(`
      SELECT s.id AS id, first_name, last_name,
        (first_name || ' ' || last_name) AS full_name
      FROM group_student AS gs
      JOIN student AS s
        ON s.id = gs.student_id
      WHERE gs.group_id = ${request.params.id}
    `)
  }

  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    // Task 2:

    // 1. Clear out the groups (delete all the students from the groups)
    const [groups] = await Promise.all([this.groupRepository.find(), this.groupStudentRepository.clear()])

    // 2. For each group, query the student rolls to see which students match the filter for the group

    const promiseArr = groups.map((group) => {
      const rollStates = group.roll_states.split(",").map((state) => `'${state}'`)
      const checkDate = moment().subtract(group.number_of_weeks, "weeks").toISOString()

      const query = `
        SELECT srs.*, COUNT(*) AS incident_count, (${group.id}) AS group_id
        FROM student_roll_state AS srs
        JOIN roll AS r
          ON r.id = srs.roll_id
        WHERE srs.state IN (${rollStates})
          AND r.completed_at > '${checkDate}'
        GROUP BY srs.student_id
        HAVING COUNT(*) ${group.ltmt} ${group.incidents}
      `

      return this.studentRollStateRepository.query(query).then((data) => ({
        groupId: group.id,
        groupStudents: data,
      }))
    })

    const studentGroupData = await Promise.all(promiseArr)

    // 3. Add the list of students that match the filter to the group
    const studentGroupPromiseArr = []
    const groupPromiseArr = []

    for (const groupData of studentGroupData) {
      const { groupId, groupStudents } = groupData

      groupPromiseArr.push(
        this.groupRepository.save({
          id: groupId,
          run_at: moment().toISOString(),
          student_count: groupStudents.length,
        })
      )

      groupStudents.map((student) => {
        const createStudentGroupInput: CreateStudentGroupInput = {
          group_id: student.group_id,
          student_id: student.student_id,
          incident_count: student.incident_count,
        }

        const groupStudent = new GroupStudent()
        groupStudent.prepareToCreate(createStudentGroupInput)

        studentGroupPromiseArr.push(this.groupStudentRepository.save(groupStudent))
      })
    }

    await Promise.all([...studentGroupPromiseArr, ...groupPromiseArr])

    return {
      message: "success",
    }
  }

  validateRollStates(states) {
    const validStates = ["unmark", "present", "absent", "late"]

    return states.split(",").every((state) => validStates.includes(state))
  }

  validateLtmt(ltmt) {
    return ltmt === "<" || ltmt === ">"
  }
}

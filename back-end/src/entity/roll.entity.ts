import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm"
import { CreateRollInput, UpdateRollInput } from "../interface/roll.interface"
import { StudentRollState } from "./student-roll-state.entity"

@Entity()
export class Roll {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  name: string

  @Column()
  completed_at: Date

  @OneToMany(() => StudentRollState, (studentRollState) => studentRollState.roll, {
    eager: true,
  })
  studentRollStates: StudentRollState[]

  public prepareToCreate(input: CreateRollInput) {
    this.name = input.name
    if (input.completed_at !== undefined) this.completed_at = input.completed_at
  }

  public prepareToUpdate(input: UpdateRollInput) {
    if (input.name !== undefined) this.name = input.name
    if (input.completed_at !== undefined) this.completed_at = input.completed_at
  }
}
